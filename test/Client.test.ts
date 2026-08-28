import {Readable} from 'node:stream';
import {text} from 'node:stream/consumers';
import fetchMock from '@fetch-mock/jest';
import {TimeoutError} from 'tarn';
import {Client} from '../src';
import {FileMakerError} from '../src/Client';

describe('Client', () => {
    let client: Client;

    beforeEach(() => {
        fetchMock.mockGlobal();
        client = new Client('https://localhost', 'db', 'user', 'pass', {
            // Keeps the reaper out of tests that move Date.now() past the session TTL, and makes a
            // wedged pool fail in a second instead of consuming jest's default 5s test timeout.
            idleTimeoutMillis: 60 * 60 * 1000,
            reapIntervalMillis: 60 * 60 * 1000,
            acquireTimeoutMillis: 1000,
            createTimeoutMillis: 1000,
            destroyTimeoutMillis: 1000,
        });
        // Sign-out is now driven by the pool, so a DELETE can happen in any test that signed in.
        fetchMock.delete('glob:https://localhost/fmi/data/v1/databases/db/sessions/*', {
            status: 200,
            body: {},
        });
    });

    afterEach(async () => {
        // Restore the clock before draining, and drain before removing the fetch mock, so the
        // sign-out requests still have a route to hit.
        jest.restoreAllMocks();
        await client.destroy();
        fetchMock.mockRestore();
    });

    describe('layout', () => {
        it('should return a Layout instance for the given layout', () => {
            const layout = client.layout('foo');
            // biome-ignore lint/complexity/useLiteralKeys: layout is private; element access is deliberate here.
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

            fetchMock.get(
                'https://localhost/fmi/data/v1/databases/db/test',
                {
                    status: 200,
                    headers: {
                        'authorization': 'Bearer foo',
                        'content-type': 'application/json',
                    },
                    body: {response: 'test'},
                },
                {repeat: 2},
            );

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

            fetchMock.post(
                'https://localhost/fmi/data/v1/databases/db/sessions',
                () => {
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
                },
                {repeat: 2},
            );

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
            fetchMock.post(
                'https://localhost/fmi/data/v1/databases/db/sessions',
                {
                    status: 200,
                    headers: {'X-FM-Data-Access-Token': 'foo'},
                    body: {},
                },
                {repeat: 2},
            );

            fetchMock.get(
                'https://localhost/fmi/data/v1/databases/db/test',
                {
                    status: 400,
                    body: {messages: [{code: '952', message: 'Invalid FileMaker DATA API token'}]},
                },
                {repeat: 2},
            );

            const request = client.request('test');
            await expect(request).rejects.toEqual(new FileMakerError('952', 'Invalid FileMaker DATA API token'));
        });

        it('should sign in with basic auth', async () => {
            fetchMock.post(
                'https://localhost/fmi/data/v1/databases/db/sessions',
                {
                    status: 200,
                    headers: {'X-FM-Data-Access-Token': 'foo'},
                    body: {},
                },
                {
                    headers: {
                        'content-type': 'application/json',
                        'authorization': 'Basic dXNlcjpwYXNz',
                    },
                },
            );

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
            fetchMock.post(
                'https://localhost/fmi/data/v1/databases/db/sessions',
                {
                    status: 200,
                    headers: {'X-FM-Data-Access-Token': 'foo'},
                    body: {},
                },
                {
                    headers: {
                        'content-type': 'application/json',
                        'authorization': 'Basic dXNlcjpwYXNz',
                    },
                },
            );

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
            expect(response.buffer).not.toBeNull();

            //typescript thinks buffer could still be null if we don't check and throw
            if (response.buffer === null) {
                throw new Error('streamm is null');
            }

            const containerReadable = Readable.fromWeb(response.buffer, {
                encoding: 'utf-8',
            });
            const value = await text(containerReadable);
            expect(value).toBe('test');
            expect(response.contentType).toBe('application/text');

            // The redirect hop must reuse the session already held. Acquiring a second one would
            // wait on a slot this call is still occupying, which deadlocks at max 1.
            expect(fetchMock).toHavePostedTimes(1, new URL('https://localhost/fmi/data/v1/databases/db/sessions'));
        });

        it('should follow the redirect on the session it already holds', async () => {
            const containerPath = '/Streaming_SSL/MainDB/asdf.xml?RCType=EmbeddedRCFileProcessor';

            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', {
                status: 200,
                headers: {'X-FM-Data-Access-Token': 'foo'},
                body: {},
            });

            let firstRequest = true;
            fetchMock.get(`https://localhost${containerPath}`, () => {
                if (firstRequest) {
                    firstRequest = false;
                    return {status: 302, headers: {'set-cookie': 'X-FMS-Session-Key=asdf123; HttpOnly'}, body: {}};
                }

                return {headers: {'content-type': 'application/text'}, body: 'test'};
            });

            // A single slot: if the recursion re-entered the pool this would time out instead.
            const client = new Client('https://localhost', 'db', 'user', 'pass', {
                max: 1,
                acquireTimeoutMillis: 200,
            });
            fetchMock.delete('glob:https://localhost/fmi/data/v1/databases/db/sessions/*', 200);

            try {
                const response = await client.requestContainer(`https://localhost${containerPath}`);
                expect(response.contentType).toBe('application/text');
            } finally {
                await client.destroy();
            }
        });

        it('should throw on a failed download', async () => {
            const containerPath = '/Streaming_SSL/MainDB/asdf.xml';

            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', {
                status: 200,
                headers: {'X-FM-Data-Access-Token': 'foo'},
                body: {},
            });

            fetchMock.get(`https://localhost${containerPath}`, {status: 404, body: ''});

            await expect(client.requestContainer(`https://localhost${containerPath}`)).rejects.toEqual(
                new Error('Failed to download container 404'),
            );
        });

        it('should retire the session when the container endpoint rejects the token', async () => {
            const containerPath = '/Streaming_SSL/MainDB/asdf.xml';
            let issued = 0;

            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', () => {
                issued += 1;
                return {status: 200, headers: {'X-FM-Data-Access-Token': `token-${issued}`}, body: {}};
            });

            fetchMock.get(`https://localhost${containerPath}`, {status: 401, body: ''});

            await expect(client.requestContainer(`https://localhost${containerPath}`)).rejects.toEqual(
                new Error('Failed to download container 401'),
            );

            fetchMock.get('https://localhost/fmi/data/v1/databases/db/test', {status: 200, body: {response: 'test'}});
            const response = await client.request('test');
            expect(response).toBe('test');

            // The rejected session is signed out rather than handed to the next caller, which signs
            // in afresh. That happens on the next acquire, not at release, so a session invalidated
            // by the last call of a quiet period lingers until the reaper collects it.
            expect(issued).toBe(2);
            expect(fetchMock).toHaveDeleted(new URL('https://localhost/fmi/data/v1/databases/db/sessions/token-1'));
        });

        it('should not sign in for a url that does not match the host', async () => {
            await expect(client.requestContainer('https://example.io')).rejects.toEqual(
                new Error('Container url must start with the same url as the FM host'),
            );

            expect(fetchMock).toHaveFetchedTimes(0, new URL('https://localhost/fmi/data/v1/databases/db/sessions'));
        });
    });

    it('should throw error on requests with missmatched url', async () => {
        await expect(client.requestContainer('https://example.io')).rejects.toEqual(
            new Error('Container url must start with the same url as the FM host'),
        );
    });

    describe('session pool', () => {
        const mockSlowLayoutRequest = (delayMillis = 20) => {
            let inFlight = 0;
            let peakInFlight = 0;

            fetchMock.get('https://localhost/fmi/data/v1/databases/db/test', async () => {
                inFlight += 1;
                peakInFlight = Math.max(peakInFlight, inFlight);
                await new Promise(resolve => setTimeout(resolve, delayMillis));
                inFlight -= 1;
                return {status: 200, body: {response: 'test'}};
            });

            return () => peakInFlight;
        };

        const mockNumberedSessions = () => {
            let issued = 0;

            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', () => {
                issued += 1;
                return {status: 200, headers: {'X-FM-Data-Access-Token': `token-${issued}`}, body: {}};
            });

            return () => issued;
        };

        it('should run concurrent requests on separate sessions up to max', async () => {
            const sessionsIssued = mockNumberedSessions();
            const peakInFlight = mockSlowLayoutRequest();

            const client = new Client('https://localhost', 'db', 'user', 'pass', {max: 3});
            fetchMock.delete('glob:https://localhost/fmi/data/v1/databases/db/sessions/*', 200);

            try {
                const responses = await Promise.all(Array.from({length: 9}, () => client.request('test')));

                expect(responses).toHaveLength(9);
                expect(sessionsIssued()).toBe(3);
                expect(peakInFlight()).toBe(3);
            } finally {
                await client.destroy();
            }
        });

        it('should sign in only once for concurrent cold requests when max is one', async () => {
            const sessionsIssued = mockNumberedSessions();
            const peakInFlight = mockSlowLayoutRequest();

            const client = new Client('https://localhost', 'db', 'user', 'pass', {max: 1});
            fetchMock.delete('glob:https://localhost/fmi/data/v1/databases/db/sessions/*', 200);

            try {
                await Promise.all([client.request('test'), client.request('test'), client.request('test')]);

                // Without a pool each of the three would race to create its own session, and two of
                // them would leak on the server until FileMaker timed them out.
                expect(sessionsIssued()).toBe(1);
                expect(peakInFlight()).toBe(1);
            } finally {
                await client.destroy();
            }
        });

        it('should reject once the pool is exhausted', async () => {
            mockNumberedSessions();
            mockSlowLayoutRequest(200);

            const client = new Client('https://localhost', 'db', 'user', 'pass', {
                max: 1,
                acquireTimeoutMillis: 20,
            });
            fetchMock.delete('glob:https://localhost/fmi/data/v1/databases/db/sessions/*', 200);

            try {
                const [first, second] = await Promise.allSettled([client.request('test'), client.request('test')]);

                expect(first.status).toBe('fulfilled');
                expect(second.status).toBe('rejected');
                expect((second as PromiseRejectedResult).reason).toBeInstanceOf(TimeoutError);
            } finally {
                await client.destroy();
            }
        });

        it('should sign out an invalidated session and retry on a fresh one', async () => {
            mockNumberedSessions();

            fetchMock.getOnce('https://localhost/fmi/data/v1/databases/db/test', {
                status: 400,
                body: {messages: [{code: '952', message: 'Invalid FileMaker DATA API token'}]},
            });
            fetchMock.getOnce('https://localhost/fmi/data/v1/databases/db/test', {
                status: 200,
                headers: {'authorization': 'Bearer token-2'},
                body: {response: 'test'},
            });

            const response = await client.request('test');
            expect(response).toBe('test');
            expect(fetchMock).toHaveDeleted(new URL('https://localhost/fmi/data/v1/databases/db/sessions/token-1'));
        });

        it('should retry with the fresh token when the caller supplies its own request', async () => {
            mockNumberedSessions();

            fetchMock.postOnce('https://localhost/fmi/data/v1/databases/db/test', {
                status: 400,
                body: {messages: [{code: '952', message: 'Invalid FileMaker DATA API token'}]},
            });
            fetchMock.postOnce('https://localhost/fmi/data/v1/databases/db/test', ({options}) => ({
                status: 200,
                body: {response: new Headers(options.headers).get('authorization')},
            }));

            // The caller's RequestInit must come back untouched, or the retry reuses the stale token.
            const request: RequestInit = {method: 'POST', body: JSON.stringify({fieldData: {}})};
            const response = await client.request<string>('test', request);

            expect(response).toBe('Bearer token-2');
            expect(request.headers).toBeUndefined();
        });

        it('should not reuse a session the server rejected', async () => {
            mockNumberedSessions();

            fetchMock.get('https://localhost/fmi/data/v1/databases/db/test', {
                status: 400,
                body: {messages: [{code: '952', message: 'Invalid FileMaker DATA API token'}]},
            });

            await expect(client.request('test')).rejects.toEqual(
                new FileMakerError('952', 'Invalid FileMaker DATA API token'),
            );

            // One session for the initial attempt, a second for the retry; neither is reused.
            expect(fetchMock).toHavePostedTimes(2, new URL('https://localhost/fmi/data/v1/databases/db/sessions'));
        });

        it('should surface a sign-in failure immediately rather than timing out', async () => {
            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', {
                status: 401,
                body: {messages: [{code: '212', message: 'Invalid user account and/or password'}]},
            });

            await expect(client.request('test')).rejects.toEqual(
                new FileMakerError('212', 'Invalid user account and/or password'),
            );
        });
    });

    describe('withSession', () => {
        it('should use a single session for every call in the callback', async () => {
            let issued = 0;
            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', () => {
                issued += 1;
                return {status: 200, headers: {'X-FM-Data-Access-Token': `token-${issued}`}, body: {}};
            });

            fetchMock.get('https://localhost/fmi/data/v1/databases/db/test', ({options}) => ({
                status: 200,
                body: {response: new Headers(options.headers).get('authorization')},
            }));

            const tokens = await client.withSession(async session => [
                await session.request<string>('test'),
                await session.request<string>('test'),
                await session.request<string>('test'),
            ]);

            expect(issued).toBe(1);
            expect(tokens).toEqual(['Bearer token-1', 'Bearer token-1', 'Bearer token-1']);
        });

        it('should expose a layout client bound to the session', async () => {
            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', {
                status: 200,
                headers: {'X-FM-Data-Access-Token': 'foo'},
                body: {},
            });

            fetchMock.get('glob:https://localhost/fmi/data/v1/databases/db/layouts/my-layout/records*', {
                status: 200,
                body: {response: {data: [], dataInfo: {}}},
            });

            const response = await client.withSession(session => session.layout('my-layout').range());
            expect(response.data).toEqual([]);
        });

        it('should release the session even when the callback throws', async () => {
            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', {
                status: 200,
                headers: {'X-FM-Data-Access-Token': 'foo'},
                body: {},
            });

            const client = new Client('https://localhost', 'db', 'user', 'pass', {
                max: 1,
                acquireTimeoutMillis: 200,
            });
            fetchMock.delete('glob:https://localhost/fmi/data/v1/databases/db/sessions/*', 200);

            try {
                await expect(client.withSession(async () => Promise.reject(new Error('boom')))).rejects.toEqual(
                    new Error('boom'),
                );

                // The single slot must be free again, otherwise this would time out.
                await expect(client.withSession(async session => session.token)).resolves.toBe('foo');
            } finally {
                await client.destroy();
            }
        });

        it('should reject use of a session after the callback returned', async () => {
            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', {
                status: 200,
                headers: {'X-FM-Data-Access-Token': 'foo'},
                body: {},
            });

            const escaped = await client.withSession(async session => session);
            await expect(escaped.request('test')).rejects.toThrow('released back to the pool');
        });
    });

    describe('destroy', () => {
        it('should sign out every session and refuse further requests', async () => {
            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', {
                status: 200,
                headers: {'X-FM-Data-Access-Token': 'foo'},
                body: {},
            });

            fetchMock.get('https://localhost/fmi/data/v1/databases/db/test', {status: 200, body: {response: 'test'}});

            await client.request('test');
            await client.destroy();

            expect(fetchMock).toHaveDeletedTimes(1, new URL('https://localhost/fmi/data/v1/databases/db/sessions/foo'));
            await expect(client.request('test')).rejects.toEqual(new Error('Client has been destroyed'));
        });

        it('should be safe to call twice', async () => {
            await client.destroy();
            await expect(client.destroy()).resolves.toBeUndefined();
        });

        it('should be reachable through async disposal', async () => {
            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', {
                status: 200,
                headers: {'X-FM-Data-Access-Token': 'foo'},
                body: {},
            });

            fetchMock.get('https://localhost/fmi/data/v1/databases/db/test', {status: 200, body: {response: 'test'}});

            await client.request('test');
            await client[Symbol.asyncDispose]();

            expect(fetchMock).toHaveDeletedTimes(1, new URL('https://localhost/fmi/data/v1/databases/db/sessions/foo'));
        });
    });

    describe('clearToken', () => {
        it('should do nothing without a token', async () => {
            fetchMock.delete('https://localhost/fmi/data/v1/databases/db/sessions/null', {
                status: 200,
                body: '{}',
            });

            await client.clearToken();
            expect(fetchMock).toHaveFetchedTimes(
                0,
                new URL('https://localhost/fmi/data/v1/databases/db/sessions/null'),
            );
        });

        it('should clear the token', async () => {
            fetchMock.post(
                'https://localhost/fmi/data/v1/databases/db/sessions',
                {
                    status: 200,
                    headers: {'X-FM-Data-Access-Token': 'foo'},
                    body: {},
                },
                {
                    headers: {
                        'content-type': 'application/json',
                        'authorization': 'Basic dXNlcjpwYXNz',
                    },
                },
            );

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

            fetchMock.post(
                'https://localhost/fmi/data/v1/databases/db/sessions',
                {
                    status: 200,
                    headers: {'X-FM-Data-Access-Token': 'bar'},
                    body: {},
                },
                {
                    headers: {
                        'content-type': 'application/json',
                        'authorization': 'Basic dXNlcjpwYXNz',
                    },
                },
            );

            fetchMock.get(
                'https://localhost/fmi/data/v1/databases/db/test',
                {
                    status: 200,
                    body: {},
                },
                {
                    headers: {
                        'authorization': 'Bearer bar',
                    },
                },
            );

            await client.request('test');
        });

        it('should let in-flight calls finish and sign their sessions out', async () => {
            fetchMock.post('https://localhost/fmi/data/v1/databases/db/sessions', {
                status: 200,
                headers: {'X-FM-Data-Access-Token': 'foo'},
                body: {},
            });

            fetchMock.get('https://localhost/fmi/data/v1/databases/db/test', async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                return {status: 200, body: {response: 'test'}};
            });

            const inFlight = client.request('test');
            // Give the request time to check its session out of the pool about to be swapped.
            await new Promise(resolve => setTimeout(resolve, 10));

            // Waits on the old pool draining; a release into the swapped-in pool would hang here.
            await client.clearToken();

            await expect(inFlight).resolves.toBe('test');
            expect(fetchMock).toHaveDeleted(new URL('https://localhost/fmi/data/v1/databases/db/sessions/foo'));
        });
    });
});
