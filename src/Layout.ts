import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type Client from './Client';
import {FileMakerError} from './Client';

export type Numerish = string | number;
export type FieldValue = string | Numerish;
export type FieldData = Record<string, FieldValue>;

export type GenericPortalData = Record<string, FieldData>;

export type RecordResponse<T extends FieldData = FieldData, U extends GenericPortalData = GenericPortalData> = {
    fieldData : T;
    recordId : string;
    modId : string;
    portalData : {
        [key in keyof U] : Array<U[key] & {
            recordId : string;
            modId : string;
        }>;
    };
};

export type ScriptParams = {
    /* eslint-disable @typescript-eslint/naming-convention */
    'script' ?: string;
    'script.param' ?: string;
    'script.prerequest' ?: string;
    'script.prerequest.param' ?: string;
    'script.presort' ?: string;
    'script.presort.param' ?: string;
    /* eslint-enable @typescript-eslint/naming-convention */
};

export type ScriptResponse = {
    /* eslint-disable @typescript-eslint/naming-convention */
    'scriptResult' ?: string;
    'scriptError' ?: string;
    'scriptResult.prerequest' ?: string;
    'scriptError.prerequest' ?: string;
    'scriptResult.presort' ?: string;
    'scriptError.presort' ?: string;
    /* eslint-enable @typescript-eslint/naming-convention */
};

export type CreateParams = ScriptParams;

export type CreateResponse = ScriptResponse & {
    recordId : string;
    modId : string;
};

export type UpdateParams = CreateParams & {
    modId ?: number;
};

export type UpdateResponse = ScriptResponse & {
    modId : string;
};

export type DeleteParams = ScriptParams;

export type DeleteResponse = ScriptResponse;

export type RangeParams = {
    offset ?: number;
    limit ?: number;
};

export type PortalRanges<U extends GenericPortalData = GenericPortalData> = Partial<{[key in keyof U] : RangeParams}>;

export type PortalRangesParams<U extends GenericPortalData = GenericPortalData> = {
    'portalRanges' ?: PortalRanges<U>;
};

export type GetParams<U extends GenericPortalData = GenericPortalData> = ScriptParams & PortalRangesParams<U> & {
    /* eslint-disable @typescript-eslint/naming-convention */
    'layout.response' ?: string;
    /* eslint-enable @typescript-eslint/naming-convention */
};

export type Sort<T extends FieldData = FieldData> = {
    fieldName : keyof T;
    sortOrder : 'ascend' | 'descend';
};

export type ListParams<
    T extends FieldData = FieldData,
    U extends GenericPortalData = GenericPortalData,
> = GetParams<U> & RangeParams & {
    sort ?: Sort<T> | Array<Sort<T>>;
};

export type GetResponse<
    T extends FieldData = FieldData,
    U extends GenericPortalData = GenericPortalData,
> = ScriptResponse & {
    data : Array<RecordResponse<T, U>>;
};

export type FindResponse<
    T extends FieldData = FieldData,
    U extends GenericPortalData = GenericPortalData,
> = GetResponse<T, U> & {
    dataInfo : {
        foundCount : number;
        returnedCount : number;
        totalRecordCount : number;
    };
};

export type Query<T extends FieldData = FieldData> = Partial<{
    [key in keyof T] : T[key] | string;
}> & {
    omit ?: boolean;
};

export type File = {
    name : string;
    buffer : Buffer;
};

export type ExecuteScriptResponse = Pick<ScriptResponse, 'scriptResult' | 'scriptError'>;

export default class Layout<T extends FieldData = FieldData, U extends GenericPortalData = GenericPortalData> {
    public constructor(private readonly layout : string, private readonly client : Client) {
    }

    public async create(fieldData : Partial<T>, params : CreateParams = {}) : Promise<CreateResponse> {
        const request : Record<string, unknown> = {fieldData};

        for (const [key, value] of Object.entries(params)) {
            request[key] = value;
        }

        return this.client.request<CreateResponse>(`layouts/${this.layout}/records`, {
            method: 'POST',
            body: JSON.stringify(request),
        });
    }

    public async update(
        recordId : number,
        fieldData : Partial<T>,
        params : UpdateParams = {},
    ) : Promise<UpdateResponse> {
        const request : Record<string, unknown> = {fieldData};

        for (const [key, value] of Object.entries(params)) {
            request[key] = value;
        }

        return this.client.request<UpdateResponse>(`layouts/${this.layout}/records/${recordId}`, {
            method: 'PATCH',
            body: JSON.stringify(request),
        });
    }

    public async delete(recordId : number, params : DeleteParams = {}) : Promise<DeleteResponse> {
        const searchParams = new URLSearchParams();

        for (const [key, value] of Object.entries(params)) {
            searchParams.set(key, value);
        }

        return this.client.request<DeleteResponse>(
            `layouts/${this.layout}/records/${recordId}?${searchParams.toString()}`,
            {method: 'DELETE'}
        );
    }

    public async upload(
        file : File | string,
        recordId : number,
        fieldName : string,
        fieldRepetition = 1,
    ) : Promise<void> {
        const form = new FormData();

        if (typeof file === 'string') {
            const filename = path.basename(file);
            const buffer = await readFile(file);
            form.append(
                'upload',
                new Blob([buffer]),
                filename
            );
        } else {
            form.append(
                'upload',
                new Blob([file.buffer]),
                file.name
            );
        }

        await this.client.request(
            `layouts/${this.layout}/records/${recordId}/containers/${fieldName}/${fieldRepetition}`,
            {
                method: 'POST',
                body: form,
            }
        );
    }

    public async get(recordId : number, params : GetParams<U> = {}) : Promise<GetResponse<T, U>> {
        const searchParams = new URLSearchParams();

        for (const [key, value] of Object.entries(params)) {
            switch (key) {
                case 'portalRanges':
                    this.addPortalRangesToRequest(value as PortalRanges<U>, searchParams);
                    break;

                default:
                    searchParams.set(key, value as string);
            }
        }

        return this.client.request<GetResponse<T, U>>(
            `layouts/${this.layout}/records/${recordId}?${searchParams.toString()}`
        );
    }

    public async range(params : ListParams<T, U> = {}) : Promise<GetResponse<T, U>> {
        const searchParams = new URLSearchParams();

        for (const [key, value] of Object.entries(params)) {
            switch (key) {
                case 'offset':
                case 'limit':
                    searchParams.set(`_${key}`, (value as number).toString());
                    break;

                case 'sort':
                    searchParams.set('_sort', JSON.stringify(Array.isArray(value) ? value : [value]));
                    break;

                case 'portalRanges':
                    this.addPortalRangesToRequest(value as PortalRanges<U>, searchParams);
                    break;

                default:
                    searchParams.set(key, value as string);
            }
        }

        return this.client.request<GetResponse<T, U>>(`layouts/${this.layout}/records?${searchParams.toString()}`);
    }

    public async find(
        query : Query<T> | Array<Query<T>>,
        params : ListParams<T, U> = {},
        ignoreEmptyResult = false
    ) : Promise<FindResponse<T, U>> {
        const request : Record<string, unknown> = {
            query: (Array.isArray(query) ? query : [query]).map(query => ({
                ...query,
                omit: query.omit?.toString(),
            })),
        };

        for (const [key, value] of Object.entries(params)) {
            switch (key) {
                case 'offset':
                case 'limit':
                    request[key] = value;
                    break;

                case 'sort':
                    request.sort = Array.isArray(value) ? value : [value];
                    break;

                case 'portalRanges':
                    this.addPortalRangesToRequest(value as PortalRanges<U>, request);
                    break;

                default:
                    request[key] = value;
            }
        }

        try {
            return await this.client.request<FindResponse<T, U>>(`layouts/${this.layout}/_find`, {
                method: 'POST',
                body: JSON.stringify(request),
            });
        } catch (e) {
            if (ignoreEmptyResult && e instanceof FileMakerError && e.code === '401') {
                return {
                    data: [],
                    dataInfo: {
                        foundCount: 0,
                        returnedCount: 0,
                        totalRecordCount: 0,
                    },
                };
            }

            throw e;
        }
    }

    /**
     * The script parameter will be in the query parameter so do not send sensitive information in it.
     */
    public async executeScript(
        scriptName : string,
        scriptParam ?: string,
    ) : Promise<ExecuteScriptResponse> {
        const searchParams = new URLSearchParams();

        if (scriptParam) {
            searchParams.set('script.param', scriptParam);
        }

        return await this.client.request<ExecuteScriptResponse>(
            `layouts/${this.layout}/script/${encodeURI(scriptName)}?${searchParams.toString()}`
        );
    }

    private addPortalRangesToRequest(
        portalRanges : PortalRanges<U>,
        request : Record<string, unknown> | URLSearchParams
    ) : void {
        for (const [portalName, range] of Object.entries(portalRanges)) {
            if (!range) {
                continue;
            }

            if (range.offset !== undefined) {
                if (request instanceof URLSearchParams) {
                    request.set(`_offset.${portalName}`, range.offset.toString());
                } else {
                    request[`offset.${portalName}`] = range.offset;
                }
            }

            if (range.limit !== undefined) {
                if (request instanceof URLSearchParams) {
                    request.set(`_limit.${portalName}`, range.limit.toString());
                } else {
                    request[`limit.${portalName}`] = range.limit;
                }
            }
        }
    }
}
