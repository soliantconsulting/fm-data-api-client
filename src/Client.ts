import http from 'http';
import https from 'https';
import fetch, {Headers, RequestInit} from 'node-fetch';
import Layout, {FieldData, GenericPortalData} from './Layout';

export class FileMakerError extends Error
{
    public readonly code : string;

    public constructor(code : string, message : string)
    {
        super(message);
        this.code = code;
    }
}

export default class Client
{
    private readonly agent : http.Agent;
    private token : string | null = null;
    private lastCall = 0;

    public constructor(
        private readonly uri : string,
        private readonly database : string,
        private readonly username : string,
        private readonly password : string
    )
    {
        this.agent = new (uri.startsWith('https:') ? https : http).Agent({
            keepAlive: true,
        });
    }

    public layout<
        T extends FieldData = FieldData,
        U extends GenericPortalData = GenericPortalData
    >(layout : string) : Layout<T, U>
    {
        return new Layout<T, U>(layout, this);
    }

    public async request(path : string, request? : RequestInit, firstTry = true) : Promise<any>
    {
        request = Client.injectHeaders(
            new Headers({
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${await this.getToken()}`,
            }),
            request
        );
        request.agent = this.agent;

        const response = await fetch(`${this.uri}/fmi/data/v1/databases/${this.database}/${path}`, request);

        if (!response.ok) {
            const data = await response.json();

            if (firstTry && data.messages[0].code === '952') {
                this.token = null;
                return this.request(path, request, false);
            }

            throw new FileMakerError(data.messages[0].code, data.messages[0].message);
        }

        this.lastCall = Date.now();
        return (await response.json()).response;
    }

    public async clearToken() : Promise<void>
    {
        if (!this.token) {
            return;
        }

        await fetch(`${this.uri}/fmi/data/v1/databases/${this.database}/sessions/${this.token}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            agent: this.agent,
        });

        this.token = null;
        this.lastCall = 0;
    }

    private async getToken() : Promise<string>
    {
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
            agent: this.agent,
        });

        if (!response.ok) {
            const data = await response.json();
            throw new FileMakerError(data.messages[0].code, data.messages[0].message);
        }

        this.token = response.headers.get('X-FM-Data-Access-Token');

        if (!this.token) {
            throw new Error('Could not get token');
        }

        this.lastCall = Date.now();
        return this.token;
    }

    private static injectHeaders(headers : Headers, request? : RequestInit) : RequestInit
    {
        if (!request) {
            request = {};
        }

        request.headers = new Headers(request.headers);

        for (const header of headers) {
            if (!request.headers.has(header[0])) {
                request.headers.append(header[0], header[1]);
            }
        }

        return request;
    }
}
