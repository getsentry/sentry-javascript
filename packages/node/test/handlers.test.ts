import * as sentryCore from '@sentry/core';
import { Hub } from '@sentry/hub';
import * as sentryHub from '@sentry/hub';
import { SpanStatus, Transaction } from '@sentry/tracing';
import { Runtime, Transaction as TransactionType } from '@sentry/types';
import * as http from 'http';
import * as net from 'net';

import { Event, Request, User } from '../src';
import { NodeClient } from '../src/client';
import { parseRequest, tracingHandler } from '../src/handlers';

describe('parseRequest', () => {
  let mockReq: { [key: string]: any };

  beforeEach(() => {
    mockReq = {
      body: 'foo',
      cookies: { test: 'test' },
      headers: {
        host: 'mattrobenolt.com',
      },
      method: 'POST',
      originalUrl: '/some/originalUrl?key=value',
      route: {
        path: '/path',
        stack: [
          {
            name: 'routeHandler',
          },
        ],
      },
      url: '/some/url?key=value',
      user: {
        custom_property: 'foo',
        email: 'tobias@mail.com',
        id: 123,
        username: 'tobias',
      },
    };
  });

  describe('parseRequest.contexts runtime', () => {
    test('runtime name must contain node', () => {
      const parsedRequest: Event = parseRequest({}, mockReq);
      expect((parsedRequest.contexts!.runtime as Runtime).name).toEqual('node');
    });

    test('runtime version must contain current node version', () => {
      const parsedRequest: Event = parseRequest({}, mockReq);
      expect((parsedRequest.contexts!.runtime as Runtime).version).toEqual(process.version);
    });

    test('runtime disbaled by options', () => {
      const parsedRequest: Event = parseRequest({}, mockReq, {
        version: false,
      });
      expect(parsedRequest).not.toHaveProperty('contexts.runtime');
    });
  });

  describe('parseRequest.user properties', () => {
    const DEFAULT_USER_KEYS = ['id', 'username', 'email'];
    const CUSTOM_USER_KEYS = ['custom_property'];

    test('parseRequest.user only contains the default properties from the user', () => {
      const parsedRequest: Event = parseRequest({}, mockReq);
      expect(Object.keys(parsedRequest.user as User)).toEqual(DEFAULT_USER_KEYS);
    });

    test('parseRequest.user only contains the custom properties specified in the options.user array', () => {
      const parsedRequest: Event = parseRequest({}, mockReq, {
        user: CUSTOM_USER_KEYS,
      });
      expect(Object.keys(parsedRequest.user as User)).toEqual(CUSTOM_USER_KEYS);
    });

    test('parseRequest.user doesnt blow up when someone passes non-object value', () => {
      const parsedRequest: Event = parseRequest(
        {},
        {
          ...mockReq,
          // @ts-ignore user is not assignable to object
          user: 'wat',
        },
      );
      expect(Object.keys(parsedRequest.user as User)).toEqual([]);
    });
  });

  describe('parseRequest.ip property', () => {
    test('can be extracted from req.ip', () => {
      const parsedRequest: Event = parseRequest(
        {},
        {
          ...mockReq,
          ip: '123',
        },
        {
          ip: true,
        },
      );
      expect(parsedRequest.user!.ip_address).toEqual('123');
    });

    test('can extract from req.connection.remoteAddress', () => {
      const parsedRequest: Event = parseRequest(
        {},
        {
          ...mockReq,
          connection: {
            remoteAddress: '321',
          },
        },
        {
          ip: true,
        },
      );
      expect(parsedRequest.user!.ip_address).toEqual('321');
    });
  });

  describe('parseRequest.request properties', () => {
    test('parseRequest.request only contains the default set of properties from the request', () => {
      const DEFAULT_REQUEST_PROPERTIES = ['cookies', 'data', 'headers', 'method', 'query_string', 'url'];
      const parsedRequest: Event = parseRequest({}, mockReq);
      expect(Object.keys(parsedRequest.request as Request)).toEqual(DEFAULT_REQUEST_PROPERTIES);
    });

    test('parseRequest.request only contains the specified properties in the options.request array', () => {
      const INCLUDED_PROPERTIES = ['data', 'headers', 'query_string', 'url'];
      const parsedRequest: Event = parseRequest({}, mockReq, {
        request: INCLUDED_PROPERTIES,
      });
      expect(Object.keys(parsedRequest.request as Request)).toEqual(INCLUDED_PROPERTIES);
    });

    test('parseRequest.request skips `body` property for GET and HEAD requests', () => {
      expect(parseRequest({}, mockReq, {}).request).toHaveProperty('data');
      expect(parseRequest({}, { ...mockReq, method: 'GET' }, {}).request).not.toHaveProperty('data');
      expect(parseRequest({}, { ...mockReq, method: 'HEAD' }, {}).request).not.toHaveProperty('data');
    });
  });

  describe('parseRequest.transaction property', () => {
    test('extracts method and full route path by default from `originalUrl`', () => {
      const parsedRequest: Event = parseRequest({}, mockReq);
      expect(parsedRequest.transaction).toEqual('POST /some/originalUrl');
    });

    test('extracts method and full route path by default from `url` if `originalUrl` is not present', () => {
      delete mockReq.originalUrl;
      const parsedRequest: Event = parseRequest({}, mockReq);
      expect(parsedRequest.transaction).toEqual('POST /some/url');
    });

    test('fallback to method and `route.path` if previous attempts failed', () => {
      delete mockReq.originalUrl;
      delete mockReq.url;
      const parsedRequest: Event = parseRequest({}, mockReq);
      expect(parsedRequest.transaction).toEqual('POST /path');
    });

    test('can extract path only instead if configured', () => {
      const parsedRequest: Event = parseRequest({}, mockReq, { transaction: 'path' });
      expect(parsedRequest.transaction).toEqual('/some/originalUrl');
    });

    test('can extract handler name instead if configured', () => {
      const parsedRequest: Event = parseRequest({}, mockReq, { transaction: 'handler' });
      expect(parsedRequest.transaction).toEqual('routeHandler');
    });
  });
}); // end describe('parseRequest()')

describe('tracingHandler', () => {
  const urlString = 'http://dogs.are.great:1231/yay/';
  const queryString = '?furry=yes&funny=very';
  const fragment = '#adoptnotbuy';

  const sentryTracingMiddleware = tracingHandler();

  let req: http.IncomingMessage, res: http.ServerResponse, next: () => undefined;

  function createNoOpSpy() {
    const noop = { noop: () => undefined }; // this is wrapped in an object so jest can spy on it
    return jest.spyOn(noop, 'noop') as any;
  }

  beforeEach(() => {
    req = new http.IncomingMessage(new net.Socket());
    req.url = `${urlString}`;
    req.method = 'GET';
    res = new http.ServerResponse(req);
    next = createNoOpSpy();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a transaction when handling a request', () => {
    const startTransaction = jest.spyOn(sentryCore, 'startTransaction');

    sentryTracingMiddleware(req, res, next);

    expect(startTransaction).toHaveBeenCalled();
  });

  it("pulls parent's data from tracing header on the request", () => {
    req.headers = { 'sentry-trace': '12312012123120121231201212312012-1121201211212012-0' };

    sentryTracingMiddleware(req, res, next);

    const transaction = (res as any).__sentry_transaction;

    expect(transaction.traceId).toEqual('12312012123120121231201212312012');
    expect(transaction.parentSpanId).toEqual('1121201211212012');
    expect(transaction.sampled).toEqual(false);
  });

  it('puts its transaction on the scope', () => {
    const hub = new Hub(new NodeClient({ tracesSampleRate: 1.0 }));
    // we need to mock both of these because the tracing handler relies on `@sentry/core` while the sampler relies on
    // `@sentry/hub`, and mocking breaks the link between the two
    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);
    jest.spyOn(sentryHub, 'getCurrentHub').mockReturnValue(hub);

    sentryTracingMiddleware(req, res, next);

    const transaction = sentryCore
      .getCurrentHub()
      .getScope()
      ?.getTransaction();

    expect(transaction).toBeDefined();
    expect(transaction).toEqual(expect.objectContaining({ name: `GET ${urlString}`, op: 'http.server' }));
  });

  it('puts its transaction on the response object', () => {
    sentryTracingMiddleware(req, res, next);

    const transaction = (res as any).__sentry_transaction;

    expect(transaction).toBeDefined();
    expect(transaction).toEqual(expect.objectContaining({ name: `GET ${urlString}`, op: 'http.server' }));
  });

  it('pulls status code from the response', async () => {
    const transaction = new Transaction({ name: 'mockTransaction' });
    jest.spyOn(sentryCore, 'startTransaction').mockReturnValue(transaction as TransactionType);
    const finishTransaction = jest.spyOn(transaction, 'finish');

    sentryTracingMiddleware(req, res, next);
    res.statusCode = 200;
    res.emit('finish');

    expect(finishTransaction).toHaveBeenCalled();
    expect(transaction.status).toBe(SpanStatus.Ok);
    expect(transaction.tags).toEqual(expect.objectContaining({ 'http.status_code': '200' }));
  });

  it('strips query string from request path', () => {
    req.url = `${urlString}${queryString}`;

    sentryTracingMiddleware(req, res, next);

    const transaction = (res as any).__sentry_transaction;

    expect(transaction?.name).toBe(`GET ${urlString}`);
  });

  it('strips fragment from request path', () => {
    req.url = `${urlString}${fragment}`;

    sentryTracingMiddleware(req, res, next);

    const transaction = (res as any).__sentry_transaction;

    expect(transaction?.name).toBe(`GET ${urlString}`);
  });

  it('strips query string and fragment from request path', () => {
    req.url = `${urlString}${queryString}${fragment}`;

    sentryTracingMiddleware(req, res, next);

    const transaction = (res as any).__sentry_transaction;

    expect(transaction?.name).toBe(`GET ${urlString}`);
  });

  it('closes the transaction when request processing is done', () => {
    const transaction = new Transaction({ name: 'mockTransaction' });
    jest.spyOn(sentryCore, 'startTransaction').mockReturnValue(transaction as TransactionType);
    const finishTransaction = jest.spyOn(transaction, 'finish');

    sentryTracingMiddleware(req, res, next);
    res.emit('finish');

    expect(finishTransaction).toHaveBeenCalled();
  });
}); // end describe('tracingHandler')
