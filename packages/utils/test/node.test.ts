import { extractNodeRequestData } from '../src/node';

describe('extractNodeRequestData()', () => {
  describe('default behaviour', () => {
    test('node', () => {
      expect(
        extractNodeRequestData({
          headers: { host: 'example.com' },
          method: 'GET',
          secure: true,
          originalUrl: '/',
        }),
      ).toEqual({
        cookies: {},
        headers: {
          host: 'example.com',
        },
        method: 'GET',
        query_string: null,
        url: 'https://example.com/',
      });
    });

    test('degrades gracefully without request data', () => {
      expect(extractNodeRequestData({})).toEqual({
        cookies: {},
        headers: {},
        method: undefined,
        query_string: null,
        url: 'http://<no host>',
      });
    });
  });

  describe('cookies', () => {
    it('uses `req.cookies` if available', () => {
      expect(
        extractNodeRequestData(
          {
            cookies: { foo: 'bar' },
          },
          ['cookies'],
        ),
      ).toEqual({
        cookies: { foo: 'bar' },
      });
    });

    it('parses the cookie header', () => {
      expect(
        extractNodeRequestData(
          {
            headers: {
              cookie: 'foo=bar;',
            },
          },
          ['cookies'],
        ),
      ).toEqual({
        cookies: { foo: 'bar' },
      });
    });

    it('falls back if no cookies are defined', () => {
      expect(extractNodeRequestData({}, ['cookies'])).toEqual({
        cookies: {},
      });
    });
  });

  describe('data', () => {
    it('includes data from `req.body` if available', () => {
      expect(
        extractNodeRequestData(
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'foo=bar',
          },
          ['data'],
        ),
      ).toEqual({
        data: 'foo=bar',
      });
    });

    it('encodes JSON body contents back to a string', () => {
      expect(
        extractNodeRequestData(
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: { foo: 'bar' },
          },
          ['data'],
        ),
      ).toEqual({
        data: '{"foo":"bar"}',
      });
    });
  });

  describe('query_string', () => {
    it('parses the query parms from the url', () => {
      expect(
        extractNodeRequestData(
          {
            headers: { host: 'example.com' },
            secure: true,
            originalUrl: '/?foo=bar',
          },
          ['query_string'],
        ),
      ).toEqual({
        query_string: 'foo=bar',
      });
    });

    it('gracefully degrades if url cannot be determined', () => {
      expect(extractNodeRequestData({}, ['query_string'])).toEqual({
        query_string: null,
      });
    });
  });

  describe('url', () => {
    test('express/koa', () => {
      expect(
        extractNodeRequestData(
          {
            host: 'example.com',
            protocol: 'https',
            url: '/',
          },
          ['url'],
        ),
      ).toEqual({
        url: 'https://example.com/',
      });
    });

    test('node', () => {
      expect(
        extractNodeRequestData(
          {
            headers: { host: 'example.com' },
            secure: true,
            originalUrl: '/',
          },
          ['url'],
        ),
      ).toEqual({
        url: 'https://example.com/',
      });
    });
  });

  describe('custom key', () => {
    it('includes the custom key if present', () => {
      expect(
        extractNodeRequestData(
          {
            httpVersion: '1.1',
          },
          ['httpVersion'],
        ),
      ).toEqual({
        httpVersion: '1.1',
      });
    });

    it('gracefully degrades if the custom key is missing', () => {
      expect(extractNodeRequestData({}, ['httpVersion'])).toEqual({});
    });
  });
});
