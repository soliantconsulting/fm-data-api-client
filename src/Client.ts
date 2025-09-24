import type {FieldData, GenericPortalData} from './Layout';
import Layout from './Layout';

export class FileMakerError extends Error {
    public readonly code : string;

    public constructor(code : string, message : string) {
        super(message);
        this.code = code;
    }
}

type FileMakerErrorResponse = {
    messages : Array<{
        code : string;
        message : string;
    }>;
};

type FileMakerResponse<T> = {
    response : T;
};

type ContainerDownload = {
    contentType ?: string | null;
    buffer : ReadableStream<unknown> | null;
};

export default class Client {
    private token : string | null = null;
    private lastCall = 0;

    public constructor(
        private readonly uri : string,
        private readonly database : string,
        private readonly username : string,
        private readonly password : string
    ) {
    }

    public layout<
        T extends FieldData = FieldData,
        U extends GenericPortalData = GenericPortalData,
    >(layout : string) : Layout<T, U> {
        return new Layout<T, U>(layout, this);
    }

    public async request<T>(path : string, request ?: RequestInit, retryOnInvalidToken = true) : Promise<T> {
        const authorizedRequest = Client.injectHeaders(
            new Headers({
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${await this.getToken()}`,
            }),
            request
        );

        const response = await fetch(`${this.uri}/fmi/data/v1/databases/${this.database}/${path}`, authorizedRequest);

        if (!response.ok) {
            const data = await response.json() as FileMakerErrorResponse;

            if (data.messages[0].code === '952' && retryOnInvalidToken) {
                this.token = null;
                return this.request(path, request, false);
            }

            throw new FileMakerError(data.messages[0].code, data.messages[0].message);
        }

        this.lastCall = Date.now();
        return (await response.json() as FileMakerResponse<T>).response;
    }

    public async requestContainer(
        containerUrl : string,
        request ?: RequestInit
    ) : Promise<ContainerDownload> {
        if (!containerUrl.toLowerCase().startsWith(this.uri.toLowerCase())) {
            throw new Error('Container url must start with the same url as the FM host');
        }

        const token = await this.getToken();
        const authorizedRequest = Client.injectHeaders(
            new Headers({
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            }),
            request
        );
        authorizedRequest.redirect = 'manual';

        const response = await fetch(containerUrl, authorizedRequest);

        if (response.status === 302 && response.headers.has('set-cookie')) {
            const redirectRequest = Client.injectHeaders(
                new Headers({
                    'cookie': response.headers.get('set-cookie') ?? '',
                }),
                request
            );
            return this.requestContainer(containerUrl, redirectRequest);
        }

        if (!response.ok) {
            throw new Error(`Failed to download container ${response.status}`);
        }

        return {
            contentType: response.headers.get('Content-Type'),
            buffer: response.body,
        };
    }

    public async clearToken() : Promise<void> {
        if (!this.token) {
            return;
        }

        await fetch(`${this.uri}/fmi/data/v1/databases/${this.database}/sessions/${this.token}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        this.token = null;
        this.lastCall = 0;
    }

    private async getToken() : Promise<string> {
        if (this.token !== null && Date.now() - this.lastCall < 14 * 60 * 1000) {
            return this.token;
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`,
        };

        const response = await fetch(`${this.uri}/fmi/data/v1/databases/${this.database}/sessions`, {
            method: 'POST',
            body: '{}',
            headers,
        });

        if (!response.ok) {
            const data = await response.json() as FileMakerErrorResponse;
            throw new FileMakerError(data.messages[0].code, data.messages[0].message);
        }

        this.token = response.headers.get('X-FM-Data-Access-Token');

        if (!this.token) {
            throw new Error('Could not get token');
        }

        this.lastCall = Date.now();
        return this.token;
    }

    private static injectHeaders(headers : Headers, request ?: RequestInit) : RequestInit {
        if (!request) {
            request = {};
        }

        request.headers = new Headers(request.headers);

        for (const header of headers) {
            // If form data is set, skip setting a content-type header in order to let fetch
            // generate one with a boundary instead.
            if (header[0] === 'content-type' && request.body instanceof FormData) {
                continue;
            }

            if (!request.headers.has(header[0])) {
                request.headers.append(header[0], header[1]);
            }
        }

        return request;
    }
}
