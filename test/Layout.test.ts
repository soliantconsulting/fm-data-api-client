import * as path from 'path';
import FormData from 'form-data';
import getStream from 'get-stream';
import type {RequestInit} from 'node-fetch';
import type {SinonStubbedInstance} from 'sinon';
import {createStubInstance, match, stub} from 'sinon';
import {Client, Layout} from '../src';
import {FileMakerError} from '../src/Client';

describe('Layout', () => {
    let clientMock : SinonStubbedInstance<Client>;
    let layout : Layout;

    beforeEach(() => {
        clientMock = createStubInstance(Client, {
            request: stub<[string, RequestInit | undefined], Promise<unknown>>().callsFake((path, requestInit) => {
                throw new Error(`Unexpected call on ${path} with init ${JSON.stringify(requestInit, undefined, 2)}`);
            }),
        });
        layout = new Layout('foo', clientMock);
    });

    describe('create', () => {
        it('should send a create call', async () => {
            const expectedResponse = {recordId: '1', modId: '1'};

            clientMock.request.withArgs('layouts/foo/records', {
                method: 'POST',
                body: JSON.stringify({
                    fieldData: {foo: 'bar'},
                }),
            }).resolves(expectedResponse);

            const response = await layout.create({foo: 'bar'});
            expect(response).toBe(expectedResponse);
        });

        it('should send a create call with script', async () => {
            const expectedResponse = {recordId: '1', modId: '1', 'scriptResult': 'bar'};

            clientMock.request.withArgs('layouts/foo/records', {
                method: 'POST',
                body: JSON.stringify({
                    fieldData: {foo: 'bar'},
                    script: 'baz',
                }),
            }).resolves(expectedResponse);

            const response = await layout.create({foo: 'bar'}, {script: 'baz'});
            expect(response).toBe(expectedResponse);
        });
    });

    describe('update', () => {
        it('should send an update call', async () => {
            const expectedResponse = {recordId: '1', modId: '1'};

            clientMock.request.withArgs('layouts/foo/records/1', {
                method: 'PATCH',
                body: JSON.stringify({
                    fieldData: {foo: 'bar'},
                }),
            }).resolves(expectedResponse);

            const response = await layout.update(1, {foo: 'bar'});
            expect(response).toBe(expectedResponse);
        });

        it('should send an update call with script', async () => {
            const expectedResponse = {recordId: '1', modId: '1', 'scriptResult': 'bar'};

            clientMock.request.withArgs('layouts/foo/records/1', {
                method: 'PATCH',
                body: JSON.stringify({
                    fieldData: {foo: 'bar'},
                    script: 'baz',
                }),
            }).resolves(expectedResponse);

            const response = await layout.update(1, {foo: 'bar'}, {script: 'baz'});
            expect(response).toBe(expectedResponse);
        });
    });

    describe('delete', () => {
        it('should send a delete call', async () => {
            const expectedResponse = {recordId: '1', modId: '1'};

            clientMock.request.withArgs('layouts/foo/records/1?', {
                method: 'DELETE',
            }).returns(Promise.resolve(expectedResponse));

            const response = await layout.delete(1);
            expect(response).toBe(expectedResponse);
        });

        it('should send a delete call with script', async () => {
            const expectedResponse = {recordId: '1', modId: '1', 'scriptResult': 'bar'};

            clientMock.request.withArgs('layouts/foo/records/1?script=baz', {
                method: 'DELETE',
            }).returns(Promise.resolve(expectedResponse));

            const response = await layout.delete(1, {script: 'baz'});
            expect(response).toBe(expectedResponse);
        });
    });

    describe('upload', () => {
        it('should send an upload call from a file', async () => {
            clientMock.request.withArgs('layouts/foo/records/1/containers/file-field/1', match({
                method: 'POST',
            })).returns(Promise.resolve(undefined));

            await layout.upload(
                path.join(__dirname, 'assets', 'test-file'),
                1,
                'file-field',
            );

            const call = clientMock.request.getCall(0);
            const request = call.args[1] as RequestInit;

            expect(request.body).toBeInstanceOf(FormData);
            const formData = request.body as FormData;
            const body = await getStream(formData);

            expect(body).toContain('name="upload"; filename="test-file"');
            expect(body).toContain('foo-from-file');
        });

        it('should send an upload call from a buffer', async () => {
            clientMock.request.withArgs('layouts/foo/records/1/containers/file-field/1', match({
                method: 'POST',
            })).returns(Promise.resolve(undefined));

            await layout.upload(
                {name: 'test-buffer', buffer: Buffer.from('foo-from-buffer')},
                1,
                'file-field',
            );

            const call = clientMock.request.getCall(0);
            const request = call.args[1] as RequestInit;

            expect(request.body).toBeInstanceOf(FormData);
            const formData = request.body as FormData;
            const body = await getStream(formData);

            expect(body).toContain('name="upload"; filename="test-buffer"');
            expect(body).toContain('foo-from-buffer');
        });
    });

    describe('get', () => {
        it('should send a get call', async () => {
            const expectedResponse = {data: [{recordId: '1', modId: '1'}]};

            clientMock.request.withArgs('layouts/foo/records/1?').returns(Promise.resolve(expectedResponse));

            const response = await layout.get(1);
            expect(response).toBe(expectedResponse);
        });

        it('should send a get call with script', async () => {
            const expectedResponse = {data: [{recordId: '1', modId: '1'}], 'scriptResult': 'bar'};

            clientMock.request.withArgs('layouts/foo/records/1?script=baz').returns(Promise.resolve(expectedResponse));

            const response = await layout.get(1, {script: 'baz'});
            expect(response).toBe(expectedResponse);
        });

        it('should send a get call with portal ranges', async () => {
            const expectedResponse = {data: [{recordId: '1', modId: '1'}]};

            clientMock.request.withArgs('layouts/foo/records/1?_offset.bar=0&_limit.bar=10')
                .returns(Promise.resolve(expectedResponse));

            const response = await layout.get(1, {portalRanges: {bar: {limit: 10, offset: 0}}});
            expect(response).toBe(expectedResponse);
        });
    });

    describe('range', () => {
        it('should send a range call', async () => {
            const expectedResponse = {data: [{recordId: '1', modId: '1'}]};

            clientMock.request.withArgs('layouts/foo/records?')
                .returns(Promise.resolve(expectedResponse));

            const response = await layout.range();
            expect(response).toBe(expectedResponse);
        });

        it('should send a range call with script', async () => {
            const expectedResponse = {data: [{recordId: '1', modId: '1'}], 'scriptResult': 'bar'};

            clientMock.request.withArgs('layouts/foo/records?script=baz')
                .returns(Promise.resolve(expectedResponse));

            const response = await layout.range({script: 'baz'});
            expect(response).toBe(expectedResponse);
        });

        it('should send a range call with offset and limit', async () => {
            const expectedResponse = {data: [{recordId: '1', modId: '1'}], 'scriptResult': 'bar'};

            clientMock.request.withArgs('layouts/foo/records?_offset=0&_limit=10')
                .returns(Promise.resolve(expectedResponse));

            const response = await layout.range({offset: 0, limit: 10});
            expect(response).toBe(expectedResponse);
        });

        it('should send a range call with single sort', async () => {
            const expectedResponse = {data: [{recordId: '1', modId: '1'}]};

            clientMock.request.withArgs(
                'layouts/foo/records?_sort='
                    + '%5B%7B%22fieldName%22%3A%22foo%22%2C%22sortOrder%22%3A%22ascend%22%7D%5D'
            ).returns(Promise.resolve(expectedResponse));

            const response = await layout.range({sort: {fieldName: 'foo', sortOrder: 'ascend'}});
            expect(response).toBe(expectedResponse);
        });

        it('should send a range call with array sort', async () => {
            const expectedResponse = {data: [{recordId: '1', modId: '1'}]};

            clientMock.request.withArgs(
                'layouts/foo/records?_sort='
                + '%5B%7B%22fieldName%22%3A%22foo%22%2C%22sortOrder%22%3A%22ascend%22%7D%5D'
            ).returns(Promise.resolve(expectedResponse));

            const response = await layout.range({sort: [{fieldName: 'foo', sortOrder: 'ascend'}]});
            expect(response).toBe(expectedResponse);
        });

        it('should send a range call with portal ranges', async () => {
            const expectedResponse = {data: [{recordId: '1', modId: '1'}]};

            clientMock.request.withArgs('layouts/foo/records?_offset.bar=0&_limit.bar=10')
                .returns(Promise.resolve(expectedResponse));

            const response = await layout.range({portalRanges: {bar: {limit: 10, offset: 0}}});
            expect(response).toBe(expectedResponse);
        });
    });

    describe('find', () => {
        it('should send a find call', async () => {
            const expectedResponse = {
                data: [{recordId: '1', modId: '1'}],
                'scriptResult': 'bar',
                dataInfo: {
                    foundCount: 1,
                    returnedCount: 1,
                    totalRecordCount: 1,
                },
            };

            clientMock.request.withArgs('layouts/foo/_find', {
                method: 'POST',
                body: JSON.stringify({
                    query: [{foo: '=bar'}],
                    script: 'baz',
                }),
            }).returns(Promise.resolve(expectedResponse));

            const response = await layout.find({foo: '=bar'}, {script: 'baz'});
            expect(response).toBe(expectedResponse);
        });

        it('should send a find call with array query', async () => {
            const expectedResponse = {
                data: [{recordId: '1', modId: '1'}],
                dataInfo: {
                    foundCount: 1,
                    returnedCount: 1,
                    totalRecordCount: 1,
                },
            };

            clientMock.request.withArgs('layouts/foo/_find', {
                method: 'POST',
                body: JSON.stringify({
                    query: [{foo: '=bar'}],
                    script: 'baz',
                }),
            }).returns(Promise.resolve(expectedResponse));

            const response = await layout.find([{foo: '=bar'}], {script: 'baz'});
            expect(response).toBe(expectedResponse);
        });

        it('should send a find call with offset and limit', async () => {
            const expectedResponse = {
                data: [{recordId: '1', modId: '1'}],
                dataInfo: {
                    foundCount: 1,
                    returnedCount: 1,
                    totalRecordCount: 1,
                },
            };

            clientMock.request.withArgs('layouts/foo/_find', {
                method: 'POST',
                body: JSON.stringify({
                    query: [{foo: '=bar'}],
                    offset: 0,
                    limit: 10,
                }),
            }).returns(Promise.resolve(expectedResponse));

            const response = await layout.find({foo: '=bar'}, {offset: 0, limit: 10});
            expect(response).toBe(expectedResponse);
        });

        it('should send a find call with single sort', async () => {
            const expectedResponse = {
                data: [{recordId: '1', modId: '1'}],
                dataInfo: {
                    foundCount: 1,
                    returnedCount: 1,
                    totalRecordCount: 1,
                },
            };

            clientMock.request.withArgs('layouts/foo/_find', {
                method: 'POST',
                body: JSON.stringify({
                    query: [{foo: '=bar'}],
                    sort: [{fieldName: 'foo', sortOrder: 'ascend'}],
                }),
            }).returns(Promise.resolve(expectedResponse));

            const response = await layout.find({foo: '=bar'}, {sort: {fieldName: 'foo', sortOrder: 'ascend'}});
            expect(response).toBe(expectedResponse);
        });

        it('should send a find call with array sort', async () => {
            const expectedResponse = {
                data: [{recordId: '1', modId: '1'}],
                dataInfo: {
                    foundCount: 1,
                    returnedCount: 1,
                    totalRecordCount: 1,
                },
            };

            clientMock.request.withArgs('layouts/foo/_find', {
                method: 'POST',
                body: JSON.stringify({
                    query: [{foo: '=bar'}],
                    sort: [{fieldName: 'foo', sortOrder: 'ascend'}],
                }),
            }).returns(Promise.resolve(expectedResponse));

            const response = await layout.find({foo: '=bar'}, {sort: [{fieldName: 'foo', sortOrder: 'ascend'}]});
            expect(response).toBe(expectedResponse);
        });

        it('should send a find call with portal ranges', async () => {
            const expectedResponse = {
                data: [{recordId: '1', modId: '1'}],
                dataInfo: {
                    foundCount: 1,
                    returnedCount: 1,
                    totalRecordCount: 1,
                },
            };

            clientMock.request.withArgs('layouts/foo/_find', {
                method: 'POST',
                body: JSON.stringify({
                    query: [{foo: '=bar'}],
                    'offset.bar': 0,
                    'limit.bar': 10,
                }),
            }).returns(Promise.resolve(expectedResponse));

            const response = await layout.find({foo: '=bar'}, {portalRanges: {bar: {limit: 10, offset: 0}}});
            expect(response).toBe(expectedResponse);
        });

        it('should send a find call with empty portal ranges', async () => {
            const expectedResponse = {
                data: [{recordId: '1', modId: '1'}],
                dataInfo: {
                    foundCount: 1,
                    returnedCount: 1,
                    totalRecordCount: 1,
                },
            };

            clientMock.request.withArgs('layouts/foo/_find', {
                method: 'POST',
                body: JSON.stringify({
                    query: [{foo: '=bar'}],
                }),
            }).returns(Promise.resolve(expectedResponse));

            const response = await layout.find({foo: '=bar'}, {portalRanges: {bar: undefined}});
            expect(response).toBe(expectedResponse);
        });

        it('should throw error by default on empty result', async () => {
            clientMock.request.withArgs('layouts/foo/_find', {
                method: 'POST',
                body: JSON.stringify({
                    query: [{foo: '=bar'}],
                }),
            }).rejects(new FileMakerError('401', 'Nothing found'));

            const request = layout.find({foo: '=bar'});
            await expect(request).rejects.toEqual(new FileMakerError('401', 'Nothing found'));
        });

        it('should not throw error on empty result when enabled', async () => {
            clientMock.request.withArgs('layouts/foo/_find', {
                method: 'POST',
                body: JSON.stringify({
                    query: [{foo: '=bar'}],
                }),
            }).rejects(new FileMakerError('401', 'Nothing found'));

            const response = await layout.find({foo: '=bar'}, {}, true);
            expect(response).toEqual({
                data: [],
                dataInfo: {
                    foundCount: 0,
                    returnedCount: 0,
                    totalRecordCount: 0,
                },
            });
        });
    });

    describe('executeScript', () => {
        it('should send a execute script call', async () => {
            const expectedResponse = {scriptResult: 'bar', scriptError: '0'};

            clientMock.request.withArgs('layouts/foo/script/testscript?')
                .returns(Promise.resolve(expectedResponse));

            const response = await layout.executeScript('testscript');
            expect(response).toBe(expectedResponse);
        });

        it('should send a execute script call with param', async () => {
            const expectedResponse = {scriptError: '0'};

            clientMock.request.withArgs('layouts/foo/script/test%20%7C%20script?script.param=%3Ftest%2B%3Dparam')
                .returns(Promise.resolve(expectedResponse));

            const response = await layout.executeScript('test | script', '?test+=param');
            expect(response).toBe(expectedResponse);
        });
    });
});
