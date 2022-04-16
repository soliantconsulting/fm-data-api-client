import http from 'http';
import https from 'https';
import nock, {cleanAll} from 'nock';
import {Client} from '../src';
import {FileMakerError} from '../src/Client';

describe('Client', () => {
    let client : Client;

    beforeEach(() => {
        client = new Client('http://example.com', 'db', 'user', 'pass');
    });

    afterEach(() => {
        cleanAll();
    });

    describe('constructor', () => {
        it('should use http agent for http URIs', () => {
            const client = new Client('http://example.com', 'db', 'user', 'pass');
            expect(client['agent']).toBeInstanceOf(http.Agent);
        });

        it('should use https agent for https URIs', () => {
            const client = new Client('https://example.com', 'db', 'user', 'pass');
            expect(client['agent']).toBeInstanceOf(https.Agent);
        });
    });

    describe('layout', () => {
        it('should return a Layout instance for the given layout', () => {
            const layout = client.layout('foo');
            expect(layout['layout']).toBe('foo');
        });
    });

    describe('request', () => {
        it('should retrieve a token on first request', async () => {
            nock('http://example.com')
                .post('/fmi/data/v1/databases/db/sessions')
                .reply(200, {}, {'X-FM-Data-Access-Token': 'foo'});
            nock('http://example.com')
                .get('/fmi/data/v1/databases/db/test')
                .matchHeader('authorization', 'Bearer foo')
                .matchHeader('content-type', 'application/json')
                .reply(200, {response: 'test'});

            const response = await client.request('test');
            expect(response).toBe('test');
        });

        it('should reuse a token for 14 minutes', async () => {
            nock('http://example.com')
                .post('/fmi/data/v1/databases/db/sessions')
                .reply(200, {}, {'X-FM-Data-Access-Token': 'foo'});
            nock('http://example.com')
                .get('/fmi/data/v1/databases/db/test')
                .matchHeader('authorization', 'Bearer foo')
                .times(2)
                .reply(200, {response: 'test'});

            jest.spyOn(Date, 'now').mockImplementation(() => 0);
            await client.request('test');

            jest.spyOn(Date, 'now').mockImplementation(() => 14 * 60 * 1000 - 1);
            await client.request('test');
        });

        it('should request a new token after 14 minutes', async () => {
            nock('http://example.com')
                .post('/fmi/data/v1/databases/db/sessions')
                .reply(200, {}, {'X-FM-Data-Access-Token': 'foo'});
            nock('http://example.com')
                .get('/fmi/data/v1/databases/db/test')
                .matchHeader('authorization', 'Bearer foo')
                .reply(200, {response: 'test'});

            jest.spyOn(Date, 'now').mockImplementation(() => 0);
            await client.request('test');

            nock('http://example.com')
                .post('/fmi/data/v1/databases/db/sessions')
                .reply(200, {}, {'X-FM-Data-Access-Token': 'bar'});
            nock('http://example.com')
                .get('/fmi/data/v1/databases/db/test')
                .matchHeader('authorization', 'Bearer bar')
                .reply(200, {response: 'test'});

            jest.spyOn(Date, 'now').mockImplementation(() => 14 * 60 * 1000);
            await client.request('test');
        });

        it('should sign in with basic auth', async () => {
            nock('http://example.com')
                .post('/fmi/data/v1/databases/db/sessions')
                .matchHeader('content-type', 'application/json')
                .matchHeader('authorization', 'Basic dXNlcjpwYXNz')
                .reply(200, {}, {'X-FM-Data-Access-Token': 'foo'});
            nock('http://example.com')
                .get('/fmi/data/v1/databases/db/test')
                .reply(200, {response: 'test'});

            await client.request('test');
        });

        it('should fail when no token can be retrieved', async () => {
            nock('http://example.com')
                .post('/fmi/data/v1/databases/db/sessions')
                .reply(200, {});

            await expect(client.request('test')).rejects.toEqual(new Error('Could not get token'));
        });

        it('should throw error on token error response', async () => {
            nock('http://example.com')
                .post('/fmi/data/v1/databases/db/sessions')
                .reply(400, {messages: [{code: '0', message: 'error'}]});

            await expect(client.request('test')).rejects.toEqual(new FileMakerError('0', 'error'));
        });

        it('should throw error on request error response', async () => {
            nock('http://example.com')
                .post('/fmi/data/v1/databases/db/sessions')
                .reply(200, {}, {'X-FM-Data-Access-Token': 'foo'});
            nock('http://example.com')
                .get('/fmi/data/v1/databases/db/test')
                .reply(400, {messages: [{code: '0', message: 'error'}]});

            await expect(client.request('test')).rejects.toEqual(new FileMakerError('0', 'error'));
        });
    });

    describe('clearToken', () => {
        it('should do nothing without a token', async () => {
            const scope = nock('http://example.com')
                .delete('/fmi/data/v1/databases/db/sessions/null')
                .reply(200, {});

            await client.clearToken();
            expect(scope.isDone()).toBe(false);
        });

        it('should clear the token', async () => {
            nock('http://example.com')
                .post('/fmi/data/v1/databases/db/sessions')
                .matchHeader('content-type', 'application/json')
                .matchHeader('authorization', 'Basic dXNlcjpwYXNz')
                .reply(200, {}, {'X-FM-Data-Access-Token': 'foo'});
            nock('http://example.com')
                .get('/fmi/data/v1/databases/db/test')
                .reply(200, {});

            await client.request('test');

            const scope = nock('http://example.com')
                .delete('/fmi/data/v1/databases/db/sessions/foo')
                .reply(200, {});

            await client.clearToken();
            expect(scope.isDone()).toBe(true);

            nock('http://example.com')
                .post('/fmi/data/v1/databases/db/sessions')
                .matchHeader('content-type', 'application/json')
                .matchHeader('authorization', 'Basic dXNlcjpwYXNz')
                .reply(200, {}, {'X-FM-Data-Access-Token': 'bar'});
            nock('http://example.com')
                .get('/fmi/data/v1/databases/db/test')
                .matchHeader('authorization', 'Bearer bar')
                .reply(200, {});

            await client.request('test');
        });
    });
});
