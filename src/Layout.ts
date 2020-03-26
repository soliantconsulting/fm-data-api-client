import FormData from 'form-data';
import fs from 'fs';
import intoStream from 'into-stream';
import Client, {FileMakerError} from './Client';

export type FieldValue = string | number | boolean;
export type FieldData = {[key : string] : FieldValue};

export type GenericPortalData = {
    [key : string] : {
        [key : string] : FieldValue;
    };
};

export type Record<T extends FieldData, U extends GenericPortalData> = {
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
    'script'? : string;
    'script.param'? : string;
    'script.prerequest'? : string;
    'script.prerequest.param'? : string;
    'script.presort'? : string;
    'script.presort.param'? : string;
};

export type ScriptResponse = {
    'scriptResult'? : string;
    'scriptError'? : string;
    'scriptResult.prerequest'? : string;
    'scriptError.prerequest'? : string;
    'scriptResult.presort'? : string;
    'scriptError.presort'? : string;
};

export type CreateParams = ScriptParams;

export type CreateResponse = ScriptResponse & {
    recordId : string;
    modId : string;
};

export type UpdateParams = CreateParams & {
    modId? : number;
};

export type UpdateResponse = ScriptResponse & {
    modId : string;
};

export type DeleteParams = ScriptParams;

export type DeleteResponse = ScriptResponse;

export type RangeParams = {
    offset? : number;
    limit? : number;
};

export type PortalRanges<U extends GenericPortalData> = {[key in keyof U] : RangeParams};

export type PortalRangesParams<U extends GenericPortalData> = {
    'portalRanges'? : PortalRanges<U>;
};

export type GetParams<U extends GenericPortalData> = ScriptParams & PortalRangesParams<U> & {
    'layout.response'? : string;
};

export type Sort<T extends FieldData> = {
    fieldName : keyof T;
    sortOrder : 'ascend' | 'descend' | string;
};

export type ListParams<T extends FieldData, U extends GenericPortalData> = GetParams<U> & RangeParams & {
    sort? : Sort<T> | Array<Sort<T>>;
};

export type GetResponse<T extends FieldData, U extends GenericPortalData> = ScriptResponse & {
    data : Array<Record<T, U>>;
};

export type Query<T extends FieldData> = Partial<T> & {
    omit? : boolean;
};

export type File = {
    name : string;
    buffer : Buffer;
};

export default class Layout<T extends FieldData, U extends GenericPortalData>
{
    public constructor(private layout : string, private client : Client)
    {
    }

    public async create(fieldData : Partial<T>, params : CreateParams = {}) : Promise<CreateResponse>
    {
        const request : {[key : string] : any} = {fieldData};

        for (const [key, value] of Object.entries(params)) {
            request[key] = value;
        }

        return this.client.request(`layouts/${this.layout}/records`, {
            method: 'POST',
            body: JSON.stringify(request),
        });
    }

    public async update(recordId : number, fieldData : Partial<T>, params : UpdateParams = {}) : Promise<UpdateResponse>
    {
        const request : {[key : string] : any} = {fieldData};

        for (const [key, value] of Object.entries(params)) {
            request[key] = value;
        }

        return this.client.request(`layouts/${this.layout}/records/${recordId}`, {
            method: 'PATCH',
            body: JSON.stringify(request),
        });
    }

    public async delete(recordId : number, params : DeleteParams = {}) : Promise<DeleteResponse>
    {
        const searchParams = new URLSearchParams();

        for (const [key, value] of Object.entries(params)) {
            searchParams.set(key, value as string);
        }

        return this.client.request(`layouts/${this.layout}/records/${recordId}?${searchParams}`, {
            method: 'DELETE',
        });
    }

    public async upload(
        file : File | string,
        recordId : number,
        fieldName : string,
        fieldRepetition = 1
    ) : Promise<void>
    {
        const form = new FormData();
        let stream;
        let options;

        if (typeof file === 'string') {
            stream = fs.createReadStream(file);
        } else {
            stream = intoStream(file.buffer);
            options = {filename: file.name};
        }

        form.append('upload', stream, options);

        return this.client.request(
            `layouts/${this.layout}/records/${recordId}/containers/${fieldName}/${fieldRepetition}`,
            {
                method: 'POST',
                body: form,
                headers: form.getHeaders(),
            }
        );
    }

    public async get(recordId : number, params : GetParams<U> = {}) : Promise<GetResponse<T, U>>
    {
        const searchParams = new URLSearchParams();

        for (const [key, value] of Object.entries(params)) {
            switch (key) {
                case 'portalRanges':
                    for (const [portalName, range] of Object.entries(value as PortalRanges<U>)) {
                        if (range.offset !== undefined) {
                            searchParams.set(`_offset.${portalName}`, range.offset.toString());
                        }

                        if (range.limit !== undefined) {
                            searchParams.set(`_limit.${portalName}`, range.limit.toString());
                        }
                    }
                    break;

                default:
                    searchParams.set(key, value as string);
            }
        }

        return this.client.request(`layouts/${this.layout}/records/${recordId}?${searchParams}`);
    }

    public async range(params : ListParams<T, U> = {}) : Promise<GetResponse<T, U>>
    {
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
                    for (const [portalName, range] of Object.entries(value as PortalRanges<U>)) {
                        if (range.offset !== undefined) {
                            searchParams.set(`_offset.${portalName}`, range.offset.toString());
                        }

                        if (range.limit !== undefined) {
                            searchParams.set(`_limit.${portalName}`, range.limit.toString());
                        }
                    }
                    break;

                default:
                    searchParams.set(key, value as string);
            }
        }

        return this.client.request(`layouts/${this.layout}/records?${searchParams}`);
    }

    public async find(
        query : Query<T> | Array<Query<T>>,
        params : ListParams<T, U> = {},
        ignoreEmptyResult = false
    ) : Promise<GetResponse<T, U>>
    {
        const request : {[key : string] : any} = {
            query: Array.isArray(query) ? query : [query],
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
                    for (const [portalName, range] of Object.entries(value as PortalRanges<U>)) {
                        if (range.offset !== undefined) {
                            request[`offset.${portalName}`] = range.offset.toString();
                        }

                        if (range.limit !== undefined) {
                            request[`limit.${portalName}`] = range.limit.toString();
                        }
                    }
                    break;

                default:
                    request[key] = value;
            }
        }

        try {
            return await this.client.request(`layouts/${this.layout}/_find`, {
                method: 'POST',
                body: JSON.stringify(request),
            });
        } catch (e) {
            if (ignoreEmptyResult && e instanceof FileMakerError && e.code === '401') {
                return {data: []};
            }

            throw e;
        }
    }
}
