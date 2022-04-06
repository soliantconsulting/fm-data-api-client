import http from 'http';
import https from 'https';
import fetch, {Headers, RequestInit} from 'node-fetch';
import Layout, {FieldData, GenericPortalData} from './Layout';
import AmazonCognitoIdentity from 'amazon-cognito-identity-js';

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
        private readonly password : string,
        private readonly isCloud : boolean = false
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

    public async request(path : string, request? : RequestInit) : Promise<any>
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

        let headers = {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`,
        };
        if (this.isCloud) {
            headers = {
                'Content-Type': 'application/json',
                'Authorization': `FMID ${await this.getCloudToken()}`,
            };
        }

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

    private async getCloudToken() : Promise<string>
    {
        const poolData = {
            UserPoolId : 'us-west-2_NqkuZcXQY',
            ClientId : '4l9rvl4mv5es1eep1qe97cautn',
        };
        const authenticationData = {
            Username : this.username,
            Password : this.password,
        };

        const authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails(authenticationData);
        const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);
        const userData = {
            Username : this.username,
            Pool : userPool,
        };
        const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

        return new Promise((resolve, reject) =>
                               cognitoUser.authenticateUser(authenticationDetails, {
                                   onSuccess(result) {
                                       resolve(result.getIdToken().getJwtToken());
                                   },
                                   onFailure(err) {
                                       reject(err);
                                   },
                               }));

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
