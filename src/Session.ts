import {FileMakerError, type FileMakerErrorResponse, type FileMakerResponse} from './FileMakerError';
import type {FieldData, GenericPortalData} from './Layout';
import Layout from './Layout';
import type {PooledSession} from './SessionPool';

export type ContainerDownload = {
    contentType?: string | null;
    buffer: ReadableStream<unknown> | null;
};

/**
 * A single FileMaker Data API session, checked out of the pool for the duration of one
 * {@link Client.withSession} call.
 *
 * A session is only valid inside the callback it was handed to. Nothing reachable from within that
 * callback may check out another session: the pool is bounded, so a nested acquire waits for a slot
 * that the outer call is still holding, and at `max: 1` that is an immediate deadlock.
 */
export default class Session {
    private released: boolean = false;

    public constructor(
        private readonly pooled: PooledSession,
        private readonly uri: string,
        private readonly database: string,
    ) {}

    public get token(): string {
        return this.pooled.token;
    }

    public layout<T extends FieldData = FieldData, U extends GenericPortalData = GenericPortalData>(
        layout: string,
    ): Layout<T, U> {
        return new Layout<T, U>(layout, this);
    }

    public async request<T>(path: string, request?: RequestInit): Promise<T> {
        this.assertUsable();

        const authorizedRequest = Session.injectHeaders(
            new Headers({
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.pooled.token}`,
            }),
            request,
        );

        const response = await fetch(`${this.uri}/fmi/data/v1/databases/${this.database}/${path}`, authorizedRequest);

        if (!response.ok) {
            const data = (await response.json()) as FileMakerErrorResponse;

            if (data.messages[0].code === '952') {
                // The server no longer recognises this token, so the session must not go back into
                // rotation. Marking it here is what makes the pool destroy it instead of handing it
                // to the next caller; the retry itself happens in Client, on a fresh session.
                this.pooled.invalid = true;
                throw new FileMakerError(data.messages[0].code, data.messages[0].message);
            }

            // The server answered, which means it also reset this session's idle timer, even though
            // the answer was an error. Empty find results (code 401) are routine and must not make a
            // perfectly live session look stale.
            this.pooled.lastUsedAt = Date.now();
            throw new FileMakerError(data.messages[0].code, data.messages[0].message);
        }

        this.pooled.lastUsedAt = Date.now();
        return ((await response.json()) as FileMakerResponse<T>).response;
    }

    public async requestContainer(containerUrl: string, request?: RequestInit): Promise<ContainerDownload> {
        this.assertUsable();

        const authorizedRequest = Session.injectHeaders(
            new Headers({
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.pooled.token}`,
            }),
            request,
        );
        authorizedRequest.redirect = 'manual';

        const response = await fetch(containerUrl, authorizedRequest);

        if (response.status === 302 && response.headers.has('set-cookie')) {
            const redirectRequest = Session.injectHeaders(
                new Headers({
                    'cookie': response.headers.get('set-cookie') ?? '',
                }),
                request,
            );
            // Recurses on this session rather than back through Client, which would try to check out
            // a second session while this one is still held.
            return this.requestContainer(containerUrl, redirectRequest);
        }

        if (response.status === 401) {
            this.pooled.invalid = true;
        }

        if (!response.ok) {
            throw new Error(`Failed to download container ${response.status}`);
        }

        this.pooled.lastUsedAt = Date.now();

        return {
            contentType: response.headers.get('Content-Type'),
            buffer: response.body,
        };
    }

    /** @internal Called by Client once the session has gone back to the pool. */
    public markReleased(): void {
        this.released = true;
    }

    private assertUsable(): void {
        if (this.released) {
            throw new Error(
                'This session has been released back to the pool and can no longer be used. ' +
                    'Sessions must not outlive the withSession() callback they were passed to.',
            );
        }
    }

    private static injectHeaders(headers: Headers, request?: RequestInit): RequestInit {
        // Copies rather than mutates the caller's RequestInit: it is reused for the retry after
        // a 952, which must not see the first attempt's Authorization header.
        const mergedHeaders = new Headers(request?.headers);

        for (const header of headers) {
            // If form data is set, skip setting a content-type header in order to let fetch
            // generate one with a boundary instead.
            if (header[0] === 'content-type' && request?.body instanceof FormData) {
                continue;
            }

            if (!mergedHeaders.has(header[0])) {
                mergedHeaders.append(header[0], header[1]);
            }
        }

        return {...request, headers: mergedHeaders};
    }
}
