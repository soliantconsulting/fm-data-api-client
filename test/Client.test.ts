import fetchMock from '@fetch-mock/jest';
import {Client} from '../src';
import {FileMakerError} from '../src/Client';

describe('Client', () => {
    let client : Client;

    beforeEach(() => {
        fetchMock.mockGlobal();
        client = new Client('https://localhost', 'db', 'user', 'pass');
    });

    afterEach(() => {
        fetchMock.mockRestore();
    });

    describe('layout', () => {
        it('should return a Layout instance for the given layout', () => {
            const layout = client.layout('foo');
            expect(layout['layout']).toBe('foo');
        });
    });

    describe('request', () => {
        it('should retrieve a token on first request', async () => {
            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', {
                status: 200,
                headers: {'X-FM-Data-Access-Token': 'foo'},
                body: {},
            });

            fetchMock.get('https://localhost/fmi/data/v1/databases/db/test', {
                status: 200,
                headers: {
                    'authorization': 'Bearer foo',
                    'content-type': 'application/json',
                },
                body: {response: 'test'},
            });
            const response = await client.request('test');
            expect(response).toBe('test');
        });

        it('should reuse a token for 14 minutes', async () => {
            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', {
                status: 200,
                headers: {'X-FM-Data-Access-Token': 'foo'},
                body: {},
            });

            fetchMock.get('https://localhost/fmi/data/v1/databases/db/test', {
                status: 200,
                headers: {
                    'authorization': 'Bearer foo',
                    'content-type': 'application/json',
                },
                body: {response: 'test'},
            }, {repeat: 2});

            jest.spyOn(Date, 'now').mockImplementation(() => 0);
            await client.request('test');

            jest.spyOn(Date, 'now').mockImplementation(() => 14 * 60 * 1000 - 1);
            await client.request('test');
        });

        it('should request a new token after 14 minutes', async () => {
            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', {
                status: 200,
                headers: {'X-FM-Data-Access-Token': 'foo'},
                body: {},
            });

            fetchMock.get('https://localhost/fmi/data/v1/databases/db/test', {
                status: 200,
                headers: {
                    'authorization': 'Bearer foo',
                    'content-type': 'application/json',
                },
                body: {response: 'test'},
            });

            jest.spyOn(Date, 'now').mockImplementation(() => 0);
            await client.request('test');

            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', {
                status: 200,
                headers: {'X-FM-Data-Access-Token': 'bar'},
                body: {},
            });

            fetchMock.get('https://localhost/fmi/data/v1/databases/db/test', {
                status: 200,
                headers: {
                    'authorization': 'Bearer bar',
                    'content-type': 'application/json',
                },
                body: {response: 'test'},
            });

            jest.spyOn(Date, 'now').mockImplementation(() => 14 * 60 * 1000);
            await client.request('test');
        });

        it('should retry with a new token if server reports invalid data API token', async () => {
            let firstRequest = true;

            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', () => {
                if (firstRequest) {
                    firstRequest = false;
                    return {
                        status: 200,
                        headers: {'X-FM-Data-Access-Token': 'foo'},
                        body: {},
                    };
                }

                return {
                    status: 200,
                    headers: {'X-FM-Data-Access-Token': 'bar'},
                    body: {},
                };
            }, {repeat: 2});

            fetchMock.getOnce('https://localhost/fmi/data/v1/databases/db/test', {
                status: 400,
                headers: {
                    'authorization': 'Bearer foo',
                    'content-type': 'application/json',
                },
                body: {messages: [{code: '952', message: 'Invalid FileMaker DATA API token'}]},
            });

            fetchMock.getOnce('https://localhost/fmi/data/v1/databases/db/test', {
                status: 200,
                headers: {
                    'authorization': 'Bearer bar',
                    'content-type': 'application/json',
                },
                body: {response: 'test'},
            });

            const response = await client.request('test');
            expect(response).toBe('test');
        });

        it('should fail when the token is reported as invalid twice', async () => {
            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', {
                status: 200,
                headers: {'X-FM-Data-Access-Token': 'foo'},
                body: {},
            }, {repeat: 2});

            fetchMock.get('https://localhost/fmi/data/v1/databases/db/test', {
                status: 400,
                body: {messages: [{code: '952', message: 'Invalid FileMaker DATA API token'}]},
            }, {repeat: 2});

            const request = client.request('test');
            await expect(request).rejects.toEqual(new FileMakerError('952', 'Invalid FileMaker DATA API token'));
        });

        it('should sign in with basic auth', async () => {
            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', {
                status: 200,
                headers: {'X-FM-Data-Access-Token': 'foo'},
                body: {},
            }, {
                headers: {
                    'content-type': 'application/json',
                    'authorization': 'Basic dXNlcjpwYXNz',
                },
            });

            fetchMock.get('https://localhost/fmi/data/v1/databases/db/test', {
                status: 200,
                body: {response: 'test'},
            });

            await client.request('test');
        });

        it('should fail when no token can be retrieved', async () => {
            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', {
                status: 200,
                body: {},
            });
            await expect(client.request('test')).rejects.toEqual(new Error('Could not get token'));
        });

        it('should throw error on token error response', async () => {
            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', {
                status: 400,
                body: {messages: [{code: '0', message: 'error'}]},
            });

            await expect(client.request('test')).rejects.toEqual(new FileMakerError('0', 'error'));
        });

        it('should throw error on request error response', async () => {
            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', {
                status: 200,
                headers: {'X-FM-Data-Access-Token': 'foo'},
                body: {},
            });

            fetchMock.get('https://localhost/fmi/data/v1/databases/db/test', {
                status: 400,
                body: {messages: [{code: '0', message: 'error'}]},
            });

            await expect(client.request('test')).rejects.toEqual(new FileMakerError('0', 'error'));
        });
    });

    describe('requestContainer', () => {
        it('should retrieve a token on first request', async () => {
            const containerPath = '/Streaming_SSL/MainDB/asdf.xml?RCType=EmbeddedRCFileProcessor';
            const cookie = 'X-FMS-Session-Key=asdf123; HttpOnly';
            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', {
                status: 200,
                headers: {'X-FM-Data-Access-Token': 'foo'},
                body: {},
            }, {
                headers: {
                    'content-type': 'application/json',
                    'authorization': 'Basic dXNlcjpwYXNz',
                },
            });

            let firstRequest = true;
            fetchMock.get(`https://localhost${containerPath}`, () => {
                if (firstRequest) {
                    firstRequest = false;
                    return {
                        status: 302,
                        headers: {
                            'set-cookie': cookie,
                        },
                        body: {},
                    };
                }

                return {
                    headers: {
                        'content-type': 'application/text',
                    },
                    body: 'test',
                };
            });

            const response = await client.requestContainer(`https://localhost${containerPath}`);
            expect(await response.buffer.text()).toBe('test');
            expect(response.contentType).toBe('application/text');
        });
    });

    it('should throw error on requests with missmatched url', async () => {
        await expect(client.requestContainer('https://example.io'))
            .rejects.toEqual(new Error('Container url must start with the same url ase the FM host'));
    });

    describe('clearToken', () => {
        it('should do nothing without a token', async () => {
            fetchMock.delete('https://localhost/fmi/data/v1/databases/db/sessions/null', {
                status: 200,
                body: '{}',
            });

            await client.clearToken();
            expect(fetchMock).toHaveFetchedTimes(0, new URL('https://localhost/fmi/data/v1/databases/db/sessions/null'));
        });

        it('should clear the token', async () => {
            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', {
                status: 200,
                headers: {'X-FM-Data-Access-Token': 'foo'},
                body: {},
            }, {
                headers: {
                    'content-type': 'application/json',
                    'authorization': 'Basic dXNlcjpwYXNz',
                },
            });

            fetchMock.get('https://localhost/fmi/data/v1/databases/db/test', {
                status: 200,
                body: {},
            });

            await client.request('test');

            fetchMock.delete('https://localhost/fmi/data/v1/databases/db/sessions/foo', {
                status: 200,
                body: {},
            });

            await client.clearToken();
            expect(fetchMock).toHaveDeletedTimes(1, new URL('https://localhost/fmi/data/v1/databases/db/sessions/foo'));

            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', {
                status: 200,
                headers: {'X-FM-Data-Access-Token': 'bar'},
                body: {},
            }, {
                headers: {
                    'content-type': 'application/json',
                    'authorization': 'Basic dXNlcjpwYXNz',
                },
            });

            fetchMock.get('https://localhost/fmi/data/v1/databases/db/test', {
                status: 200,
                body: {},
            }, {
                headers: {
                    'authorization': 'Bearer bar',
                },
            });

            await client.request('test');
        });
    });
});
