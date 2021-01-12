import * as sentryCore from '@sentry/core';
import { Hub } from '@sentry/hub';
import * as sentryHub from '@sentry/hub';
import { SpanStatus, Transaction } from '@sentry/tracing';
import { Runtime } from '@sentry/types';
import * as http from 'http';
import * as net from 'net';

import { Event, Request, User } from '../src';
import { NodeClient } from '../src/client';
import { ExpressRequest, parseRequest, tracingHandler } from '../src/handlers';

describe('parseRequest', () => {
  let mockReq: { [key: string]: any };

  beforeEach(() => {
    mockReq = {
      baseUrl: '/routerMountPath',
      body: 'foo',
      cookies: { test: 'test' },
      headers: {
        host: 'mattrobenolt.com',
      },
      method: 'POST',
      originalUrl: '/routerMountPath/subpath/specificValue?querystringKey=querystringValue',
      path: '/subpath/specificValue',
      query: {
        querystringKey: 'querystringValue',
      },
      route: {
        path: '/subpath/:parameterName',
        stack: [
          {
            name: 'parameterNameRouteHandler',
          },
        ],
      },
      url: '/subpath/specificValue?querystringKey=querystringValue',
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
      const parsedRequest: Event = parseRequest({}, mockReq as ExpressRequest);
      expect((parsedRequest.contexts!.runtime as Runtime).name).toEqual('node');
    });

    test('runtime version must contain current node version', () => {
      const parsedRequest: Event = parseRequest({}, mockReq as ExpressRequest);
      expect((parsedRequest.contexts!.runtime as Runtime).version).toEqual(process.version);
    });

    test('runtime disbaled by options', () => {
      const parsedRequest: Event = parseRequest({}, mockReq as ExpressRequest, {
        version: false,
      });
      expect(parsedRequest).not.toHaveProperty('contexts.runtime');
    });
  });

  describe('parseRequest.user properties', () => {
    const DEFAULT_USER_KEYS = ['id', 'username', 'email'];
    const CUSTOM_USER_KEYS = ['custom_property'];

    test('parseRequest.user only contains the default properties from the user', () => {
      const parsedRequest: Event = parseRequest({}, mockReq as ExpressRequest);
      expect(Object.keys(parsedRequest.user as User)).toEqual(DEFAULT_USER_KEYS);
    });

    test('parseRequest.user only contains the custom properties specified in the options.user array', () => {
      const parsedRequest: Event = parseRequest({}, mockReq as ExpressRequest, {
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
        } as ExpressRequest,
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
          } as net.Socket,
        } as ExpressRequest,
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
      const parsedRequest: Event = parseRequest({}, mockReq as ExpressRequest);
      expect(Object.keys(parsedRequest.request as Request)).toEqual(DEFAULT_REQUEST_PROPERTIES);
    });

    test('parseRequest.request only contains the specified properties in the options.request array', () => {
      const INCLUDED_PROPERTIES = ['data', 'headers', 'query_string', 'url'];
      const parsedRequest: Event = parseRequest({}, mockReq as ExpressRequest, {
        request: INCLUDED_PROPERTIES,
      });
      expect(Object.keys(parsedRequest.request as Request)).toEqual(INCLUDED_PROPERTIES);
    });

    test('parseRequest.request skips `body` property for GET and HEAD requests', () => {
      expect(parseRequest({}, mockReq as ExpressRequest, {}).request).toHaveProperty('data');
      expect(parseRequest({}, { ...mockReq, method: 'GET' } as ExpressRequest, {}).request).not.toHaveProperty('data');
      expect(parseRequest({}, { ...mockReq, method: 'HEAD' } as ExpressRequest, {}).request).not.toHaveProperty('data');
    });
  });

  describe('parseRequest.transaction property', () => {
    test('extracts method and full route path by default`', () => {
      const parsedRequest: Event = parseRequest({}, mockReq as ExpressRequest);
      expect(parsedRequest.transaction).toEqual('POST /routerMountPath/subpath/:parameterName');
    });

    test('extracts method and full path by default when mountpoint is `/`', () => {
      mockReq.originalUrl = mockReq.originalUrl.replace('/routerMountpath', '');
      mockReq.baseUrl = '';
      const parsedRequest: Event = parseRequest({}, mockReq as ExpressRequest);
      // "sub"path is the full path here, because there's no router mount path
      expect(parsedRequest.transaction).toEqual('POST /subpath/:parameterName');
    });

    test('fallback to method and `originalUrl` if route is missing', () => {
      delete mockReq.route;
      const parsedRequest: Event = parseRequest({}, mockReq as ExpressRequest);
      expect(parsedRequest.transaction).toEqual('POST /routerMountPath/subpath/specificValue');
    });

    test('can extract path only instead if configured', () => {
      const parsedRequest: Event = parseRequest({}, mockReq as ExpressRequest, { transaction: 'path' });
      expect(parsedRequest.transaction).toEqual('/routerMountPath/subpath/:parameterName');
    });

    test('can extract handler name instead if configured', () => {
      const parsedRequest: Event = parseRequest({}, mockReq as ExpressRequest, { transaction: 'handler' });
      expect(parsedRequest.transaction).toEqual('parameterNameRouteHandler');
    });
  });
});

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

    // since we have no tracesSampler defined, the default behavior (inherit if possible) applies
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

  it('pulls status code from the response', done => {
    const transaction = new Transaction({ name: 'mockTransaction' });
    jest.spyOn(sentryCore, 'startTransaction').mockReturnValue(transaction as Transaction);
    const finishTransaction = jest.spyOn(transaction, 'finish');

    sentryTracingMiddleware(req, res, next);
    res.statusCode = 200;
    res.emit('finish');

    setImmediate(() => {
      expect(finishTransaction).toHaveBeenCalled();
      expect(transaction.status).toBe(SpanStatus.Ok);
      expect(transaction.tags).toEqual(expect.objectContaining({ 'http.status_code': '200' }));
      done();
    });
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

  it('closes the transaction when request processing is done', done => {
    const transaction = new Transaction({ name: 'mockTransaction' });
    jest.spyOn(sentryCore, 'startTransaction').mockReturnValue(transaction as Transaction);
    const finishTransaction = jest.spyOn(transaction, 'finish');

    sentryTracingMiddleware(req, res, next);
    res.emit('finish');

    setImmediate(() => {
      expect(finishTransaction).toHaveBeenCalled();
      done();
    });
  });

  it('waits to finish transaction until all spans are finished, even though `transaction.finish()` is registered on `res.finish` event first', done => {
    const transaction = new Transaction({ name: 'mockTransaction', sampled: true });
    transaction.initSpanRecorder();
    const span = transaction.startChild({
      description: 'reallyCoolHandler',
      op: 'middleware',
    });
    jest.spyOn(sentryCore, 'startTransaction').mockReturnValue(transaction as Transaction);
    const finishSpan = jest.spyOn(span, 'finish');
    const finishTransaction = jest.spyOn(transaction, 'finish');

    let sentEvent: Event;
    jest.spyOn((transaction as any)._hub, 'captureEvent').mockImplementation(event => {
      sentEvent = event as Event;
    });

    sentryTracingMiddleware(req, res, next);
    res.once('finish', () => {
      span.finish();
    });
    res.emit('finish');

    setImmediate(() => {
      expect(finishSpan).toHaveBeenCalled();
      expect(finishTransaction).toHaveBeenCalled();
      expect(span.endTimestamp).toBeLessThanOrEqual(transaction.endTimestamp!);
      expect(sentEvent.spans?.length).toEqual(1);
      expect(sentEvent.spans?.[0].spanId).toEqual(span.spanId);
      done();
    });
  });
}); // end describe('tracingHandler')
