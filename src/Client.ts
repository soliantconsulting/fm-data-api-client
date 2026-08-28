import {FileMakerError} from './FileMakerError';
import type {FieldData, GenericPortalData} from './Layout';
import Layout from './Layout';
import type {ContainerDownload} from './Session';
import Session from './Session';
import {SessionPool, type SessionPoolOptions} from './SessionPool';

export {FileMakerError} from './FileMakerError';
export type {ContainerDownload} from './Session';

/**
 * A client for one FileMaker database.
 *
 * The client owns a pool of Data API sessions rather than a single shared token. Every call checks a
 * session out for its duration and returns it afterwards, so concurrent callers get their own
 * sessions instead of interleaving on one, up to `max`.
 *
 * A client is meant to be long lived: build one per process and share it. Because it holds server
 * sessions, call {@link Client.destroy} on shutdown, or use `await using` on Node 22.
 */
export default class Client {
    private pool: SessionPool;

    public constructor(
        private readonly uri: string,
        private readonly database: string,
        private readonly username: string,
        private readonly password: string,
        private readonly poolOptions: SessionPoolOptions = {},
    ) {
        this.pool = this.createPool();
    }

    public layout<T extends FieldData = FieldData, U extends GenericPortalData = GenericPortalData>(
        layout: string,
    ): Layout<T, U> {
        return new Layout<T, U>(layout, this);
    }

    /**
     * Runs `callback` against a single session, so that every call inside it uses the same token.
     * Useful where FileMaker keeps state per session, such as a found set that a later call relies
     * on.
     *
     * The session is returned to the pool when the callback settles, and is unusable afterwards, so
     * it must not be stored or leaked out of the callback. Nothing inside the callback may call back
     * into the client's own `request`/`requestContainer`/`withSession`: the pool is bounded, and
     * waiting for a slot the callback itself is holding deadlocks.
     *
     * Unlike {@link Client.request}, an invalid token (FileMaker error 952) is not retried here,
     * because the callback may already have written something and must not run twice. The session is
     * retired either way.
     */
    public async withSession<T>(callback: (session: Session) => Promise<T>): Promise<T> {
        // Captured once: clearToken() swaps this.pool while calls are in flight, and the session
        // must go back to the pool it came from, whose destroy() waits on it.
        const pool = this.pool;
        const pooled = await pool.acquire();
        const session = new Session(pooled, this.uri, this.database);

        try {
            return await callback(session);
        } finally {
            session.markReleased();
            pool.release(pooled);
        }
    }

    public async request<T>(path: string, request?: RequestInit, retryOnInvalidToken = true): Promise<T> {
        try {
            return await this.withSession(session => session.request<T>(path, request));
        } catch (e) {
            if (retryOnInvalidToken && e instanceof FileMakerError && e.code === '952') {
                // The session that failed has been marked invalid, so the pool will not hand it back
                // out; this acquires a freshly signed-in one.
                return this.withSession(session => session.request<T>(path, request));
            }

            throw e;
        }
    }

    public async requestContainer(containerUrl: string, request?: RequestInit): Promise<ContainerDownload> {
        // Checked before acquiring, so a bad URL does not cost a sign-in.
        if (!containerUrl.toLowerCase().startsWith(this.uri.toLowerCase())) {
            throw new Error('Container url must start with the same url as the FM host');
        }

        return this.withSession(session => session.requestContainer(containerUrl, request));
    }

    /**
     * Signs out of every session and closes the pool. Waits for in-flight calls to finish first. The
     * client cannot be used afterwards.
     */
    public async destroy(): Promise<void> {
        await this.pool.destroy();
    }

    public async [Symbol.asyncDispose](): Promise<void> {
        await this.destroy();
    }

    /**
     * Signs out of every session held right now, then carries on with fresh ones.
     *
     * @deprecated Sessions are signed out on their own once they go idle. Use {@link Client.destroy}
     *   to shut the client down for good, which is almost always what is wanted here.
     */
    public async clearToken(): Promise<void> {
        // Swapped before draining so that calls arriving during the sign-out get a working pool
        // rather than a rejection, and so that in-flight calls on the old pool run to completion.
        const previous = this.pool;
        this.pool = this.createPool();
        await previous.destroy();
    }

    private createPool(): SessionPool {
        return new SessionPool(this.uri, this.database, this.username, this.password, this.poolOptions);
    }
}
