import * as http from 'http';
import * as sentryCore from '@sentry/core';
import {
  Hub,
  Scope,
  Span,
  getActiveSpan,
  getClient,
  getCurrentScope,
  makeMain,
  setAsyncContextStrategy,
  startSpanManual,
} from '@sentry/core';
import { SentryError } from '@sentry/utils';

import { NodeClient } from '../src/client';
import { errorHandler, requestHandler, tracingHandler } from '../src/handlers';
import { getDefaultNodeClientOptions } from './helper/node-client-options';

function mockAsyncContextStrategy(getHub: () => Hub): void {
  function getCurrentHub(): Hub | undefined {
    return getHub();
  }

  function runWithAsyncContext<T>(fn: (hub: Hub) => T): T {
    return fn(getHub());
  }

  setAsyncContextStrategy({ getCurrentHub, runWithAsyncContext });
}

describe('requestHandler', () => {
  const headers = { ears: 'furry', nose: 'wet', tongue: 'spotted', cookie: 'favorite=zukes' };
  const method = 'wagging';
  const protocol = 'mutualsniffing';
  const hostname = 'the.dog.park';
  const path = '/by/the/trees/';
  const queryString = 'chase=me&please=thankyou';

  const sentryRequestMiddleware = requestHandler();

  let req: http.IncomingMessage, res: http.ServerResponse, next: () => undefined;
  let client: NodeClient;

  function createNoOpSpy() {
    const noop = { noop: () => undefined }; // this is wrapped in an object so jest can spy on it
    return jest.spyOn(noop, 'noop') as any;
  }

  beforeEach(() => {
    req = {
      headers,
      method,
      protocol,
      hostname,
      originalUrl: `${path}?${queryString}`,
    } as unknown as http.IncomingMessage;
    res = new http.ServerResponse(req);
    next = createNoOpSpy();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('autoSessionTracking is enabled, sets requestSession status to ok, when handling a request', () => {
    const options = getDefaultNodeClientOptions({ autoSessionTracking: true, release: '1.2' });
    client = new NodeClient(options);
    const hub = new Hub(client);

    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);
    mockAsyncContextStrategy(() => hub);

    sentryRequestMiddleware(req, res, next);

    const scope = getCurrentScope();
    expect(scope?.getRequestSession()).toEqual({ status: 'ok' });
  });

  it('autoSessionTracking is disabled, does not set requestSession, when handling a request', () => {
    const options = getDefaultNodeClientOptions({ autoSessionTracking: false, release: '1.2' });
    client = new NodeClient(options);
    const hub = new Hub(client);

    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);
    mockAsyncContextStrategy(() => hub);

    sentryRequestMiddleware(req, res, next);

    const scope = getCurrentScope();
    expect(scope?.getRequestSession()).toBeUndefined();
  });

  it('autoSessionTracking is enabled, calls _captureRequestSession, on response finish', done => {
    const options = getDefaultNodeClientOptions({ autoSessionTracking: true, release: '1.2' });
    client = new NodeClient(options);
    const hub = new Hub(client);

    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);
    mockAsyncContextStrategy(() => hub);

    const captureRequestSession = jest.spyOn<any, any>(client, '_captureRequestSession');

    sentryRequestMiddleware(req, res, next);

    const scope = getCurrentScope();
    res.emit('finish');

    setImmediate(() => {
      expect(scope?.getRequestSession()).toEqual({ status: 'ok' });
      expect(captureRequestSession).toHaveBeenCalled();
      done();
    });
  });

  it('autoSessionTracking is disabled, does not call _captureRequestSession, on response finish', done => {
    const options = getDefaultNodeClientOptions({ autoSessionTracking: false, release: '1.2' });
    client = new NodeClient(options);
    const hub = new Hub(client);

    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);
    mockAsyncContextStrategy(() => hub);

    const captureRequestSession = jest.spyOn<any, any>(client, '_captureRequestSession');

    sentryRequestMiddleware(req, res, next);
    const scope = getCurrentScope();
    res.emit('finish');

    setImmediate(() => {
      expect(scope?.getRequestSession()).toBeUndefined();
      expect(captureRequestSession).not.toHaveBeenCalled();
      done();
    });
  });

  it('patches `res.end` when `flushTimeout` is specified', done => {
    const flush = jest.spyOn(sentryCore, 'flush').mockResolvedValue(true);

    const sentryRequestMiddleware = requestHandler({ flushTimeout: 1337 });
    sentryRequestMiddleware(req, res, next);
    res.end('ok');

    setImmediate(() => {
      expect(flush).toHaveBeenCalledWith(1337);
      expect(res.finished).toBe(true);
      done();
    });
  });

  it('prevents errors thrown during `flush` from breaking the response', done => {
    jest.spyOn(sentryCore, 'flush').mockRejectedValue(new SentryError('HTTP Error (429)'));

    const sentryRequestMiddleware = requestHandler({ flushTimeout: 1337 });
    sentryRequestMiddleware(req, res, next);
    res.end('ok');

    setImmediate(() => {
      expect(res.finished).toBe(true);
      done();
    });
  });

  it('stores request and request data options in `sdkProcessingMetadata`', () => {
    const hub = new Hub(new NodeClient(getDefaultNodeClientOptions()));
    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);
    mockAsyncContextStrategy(() => hub);

    const requestHandlerOptions = { include: { ip: false } };
    const sentryRequestMiddleware = requestHandler(requestHandlerOptions);

    sentryRequestMiddleware(req, res, next);

    const scope = getCurrentScope();
    expect((scope as any)._sdkProcessingMetadata).toEqual({
      request: req,
      requestDataOptionsFromExpressHandler: requestHandlerOptions,
    });
  });
});

describe('tracingHandler', () => {
  const headers = { ears: 'furry', nose: 'wet', tongue: 'spotted', cookie: 'favorite=zukes' };
  const method = 'wagging';
  const protocol = 'mutualsniffing';
  const hostname = 'the.dog.park';
  const path = '/by/the/trees/';
  const queryString = 'chase=me&please=thankyou';
  const fragment = '#adoptnotbuy';

  const sentryTracingMiddleware = tracingHandler();

  let hub: Hub, req: http.IncomingMessage, res: http.ServerResponse, next: () => undefined;

  function createNoOpSpy() {
    const noop = { noop: () => undefined }; // this is wrapped in an object so jest can spy on it
    return jest.spyOn(noop, 'noop') as any;
  }

  beforeEach(() => {
    hub = new Hub(new NodeClient(getDefaultNodeClientOptions({ tracesSampleRate: 1.0 })));
    // eslint-disable-next-line deprecation/deprecation
    makeMain(hub);

    mockAsyncContextStrategy(() => hub);
    req = {
      headers,
      method,
      protocol,
      hostname,
      originalUrl: `${path}?${queryString}`,
    } as unknown as http.IncomingMessage;
    res = new http.ServerResponse(req);
    next = createNoOpSpy();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a span when handling a request', () => {
    const startSpanManualSpy = jest.spyOn(sentryCore, 'startSpanManual');

    sentryTracingMiddleware(req, res, next);

    expect(startSpanManualSpy).toHaveBeenCalled();
  });

  it("doesn't create a span when handling a `HEAD` request", () => {
    const startSpanManualSpy = jest.spyOn(sentryCore, 'startSpanManual');
    req.method = 'HEAD';

    sentryTracingMiddleware(req, res, next);

    expect(startSpanManualSpy).not.toHaveBeenCalled();
  });

  it("doesn't create a span when handling an `OPTIONS` request", () => {
    const startSpanManualSpy = jest.spyOn(sentryCore, 'startSpanManual');
    req.method = 'OPTIONS';

    sentryTracingMiddleware(req, res, next);

    expect(startSpanManualSpy).not.toHaveBeenCalled();
  });

  it("doesn't create a span if tracing is disabled", () => {
    delete getClient()?.getOptions().tracesSampleRate;
    const startSpanManualSpy = jest.spyOn(sentryCore, 'startSpanManual');

    sentryTracingMiddleware(req, res, next);

    expect(startSpanManualSpy).not.toHaveBeenCalled();
  });

  it("provides the right propagation context within the handler based on request's sentry-trace header", () => {
    expect.assertions(1);

    req.headers = { 'sentry-trace': '12312012123120121231201212312012-1121201211212012-0' };

    sentryTracingMiddleware(req, res, () => {
      expect(getCurrentScope().getPropagationContext()).toMatchObject({
        traceId: '12312012123120121231201212312012',
        parentSpanId: '1121201211212012',
        sampled: false,
        dsc: {},
      });
    });
  });

  it("provides the right propagation context within the handler based on request's headers", () => {
    expect.assertions(1);

    req.headers = {
      'sentry-trace': '12312012123120121231201212312012-1121201211212012-1',
      baggage: 'sentry-version=1.0,sentry-environment=production',
    };

    sentryTracingMiddleware(req, res, () => {
      expect(getCurrentScope().getPropagationContext()).toMatchObject({
        traceId: '12312012123120121231201212312012',
        parentSpanId: '1121201211212012',
        sampled: true,
        dsc: { version: '1.0', environment: 'production' },
      });
    });
  });

  it("doesn't populate dynamic sampling context with 3rd party baggage", () => {
    expect.assertions(1);

    req.headers = {
      'sentry-trace': '12312012123120121231201212312012-1121201211212012-0',
      baggage: 'sentry-version=1.0,sentry-environment=production,dogs=great,cats=boring',
    };

    sentryTracingMiddleware(req, res, next);

    sentryTracingMiddleware(req, res, () => {
      expect(getCurrentScope().getPropagationContext()).toMatchObject({
        dsc: { version: '1.0', environment: 'production' },
      });
    });
  });

  it("makes it's span active in the handler", () => {
    const span = new Span();
    jest.spyOn(sentryCore, 'startSpanManual').mockImplementationOnce(() => span);

    sentryTracingMiddleware(req, res, () => {
      expect(getActiveSpan()).toBe(span);
    });
  });

  it('sets span status from the response status code', done => {
    const mockBeforeSendTransaction = jest.fn(event => event);
    const options = getDefaultNodeClientOptions({
      tracesSampleRate: 1.0,
      beforeSendTransaction: mockBeforeSendTransaction,
    });
    sentryCore.setCurrentClient(new NodeClient(options));

    sentryTracingMiddleware(req, res, next);
    res.statusCode = 200;
    res.emit('finish');

    setImmediate(() => {
      expect(mockBeforeSendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              status: 'ok',
              data: expect.objectContaining({
                'http.status_code': '200',
              }),
            }),
          }),
        }),
        expect.anything(),
      );
      done();
    });
  });

  it('strips query string from request path', () => {
    const startSpanManualSpy = jest.spyOn(sentryCore, 'startSpanManual');
    req.url = `${path}?${queryString}`;

    sentryTracingMiddleware(req, res, next);

    expect(startSpanManualSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: `${method.toUpperCase()} ${path}` }),
      expect.any(Function),
    );
  });

  it('strips fragment from request path', () => {
    const startSpanManualSpy = jest.spyOn(sentryCore, 'startSpanManual');
    req.url = `${path}${fragment}`;

    sentryTracingMiddleware(req, res, next);

    expect(startSpanManualSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: `${method.toUpperCase()} ${path}` }),
      expect.any(Function),
    );
  });

  it('strips query string and fragment from request path', () => {
    const startSpanManualSpy = jest.spyOn(sentryCore, 'startSpanManual');
    req.url = `${path}?${queryString}${fragment}`;

    sentryTracingMiddleware(req, res, next);

    expect(startSpanManualSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: `${method.toUpperCase()} ${path}` }),
      expect.any(Function),
    );
  });

  it('closes the transaction when request processing is done', done => {
    let spanEndSpy: any;

    sentryTracingMiddleware(req, res, () => {
      const span = getActiveSpan();
      spanEndSpy = jest.spyOn(span!, 'end');
    });

    res.emit('finish');

    setImmediate(() => {
      expect(spanEndSpy).toHaveBeenCalled();
      done();
    });
  });

  it('gives child spans the opportunity to end on `res.finish`', done => {
    const mockBeforeSendTransaction = jest.fn(event => event);
    const options = getDefaultNodeClientOptions({
      tracesSampleRate: 1.0,
      beforeSendTransaction: mockBeforeSendTransaction,
    });
    sentryCore.setCurrentClient(new NodeClient(options));

    sentryTracingMiddleware(req, res, () => {
      startSpanManual({ name: 'child-span' }, span => {
        res.once('finish', () => {
          span?.end();
        });
      });
    });

    res.emit('finish');

    setImmediate(() => {
      expect(mockBeforeSendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          spans: expect.arrayContaining([expect.objectContaining({ description: 'child-span' })]),
        }),
        expect.anything(),
      );
      done();
    });

    expect.assertions(1);
  });

  it('stores request in scope metadata', () => {
    expect.assertions(1);
    sentryTracingMiddleware(req, res, () => {
      const scopeMetadata = getCurrentScope().getScopeData().sdkProcessingMetadata;
      expect(scopeMetadata.request).toBe(req);
    });
  });
});

describe('errorHandler()', () => {
  const headers = { ears: 'furry', nose: 'wet', tongue: 'spotted', cookie: 'favorite=zukes' };
  const method = 'wagging';
  const protocol = 'mutualsniffing';
  const hostname = 'the.dog.park';
  const path = '/by/the/trees/';
  const queryString = 'chase=me&please=thankyou';

  const sentryErrorMiddleware = errorHandler();

  let req: http.IncomingMessage, res: http.ServerResponse, next: () => undefined;
  let client: NodeClient;

  function createNoOpSpy() {
    const noop = { noop: () => undefined }; // this is wrapped in an object so jest can spy on it
    return jest.spyOn(noop, 'noop') as any;
  }

  beforeEach(() => {
    req = {
      headers,
      method,
      protocol,
      hostname,
      originalUrl: `${path}?${queryString}`,
    } as unknown as http.IncomingMessage;
    res = new http.ServerResponse(req);
    next = createNoOpSpy();
  });

  afterEach(() => {
    if ('_sessionFlusher' in client) clearInterval((client as any)._sessionFlusher._intervalId);
    jest.restoreAllMocks();
  });
  it('when autoSessionTracking is disabled, does not set requestSession status on Crash', () => {
    const options = getDefaultNodeClientOptions({ autoSessionTracking: false, release: '3.3' });
    client = new NodeClient(options);
    // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
    // by the`requestHandler`)
    client.initSessionFlusher();

    const scope = getCurrentScope();
    const hub = new Hub(client);

    jest.spyOn<any, any>(client, '_captureRequestSession');
    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);

    scope?.setRequestSession({ status: 'ok' });
    sentryErrorMiddleware({ name: 'error', message: 'this is an error' }, req, res, next);
    const requestSession = scope?.getRequestSession();
    expect(requestSession).toEqual({ status: 'ok' });
  });

  it('autoSessionTracking is enabled + requestHandler is not used -> does not set requestSession status on Crash', () => {
    const options = getDefaultNodeClientOptions({ autoSessionTracking: false, release: '3.3' });
    client = new NodeClient(options);

    const scope = getCurrentScope();
    const hub = new Hub(client);

    jest.spyOn<any, any>(client, '_captureRequestSession');
    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);

    scope?.setRequestSession({ status: 'ok' });
    sentryErrorMiddleware({ name: 'error', message: 'this is an error' }, req, res, next);
    const requestSession = scope?.getRequestSession();
    expect(requestSession).toEqual({ status: 'ok' });
  });

  it('when autoSessionTracking is enabled, should set requestSession status to Crashed when an unhandled error occurs within the bounds of a request', () => {
    const options = getDefaultNodeClientOptions({ autoSessionTracking: true, release: '1.1' });
    client = new NodeClient(options);
    // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
    // by the`requestHandler`)
    client.initSessionFlusher();
    const scope = new Scope();
    const hub = new Hub(client, scope);
    mockAsyncContextStrategy(() => hub);

    jest.spyOn<any, any>(client, '_captureRequestSession');

    hub.run(() => {
      scope?.setRequestSession({ status: 'ok' });
      sentryErrorMiddleware({ name: 'error', message: 'this is an error' }, req, res, () => {
        const scope = getCurrentScope();
        const requestSession = scope?.getRequestSession();
        expect(requestSession).toEqual({ status: 'crashed' });
      });
    });
  });

  it('when autoSessionTracking is enabled, should not set requestSession status on Crash when it occurs outside the bounds of a request', () => {
    const options = getDefaultNodeClientOptions({ autoSessionTracking: true, release: '2.2' });
    client = new NodeClient(options);
    // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
    // by the`requestHandler`)
    client.initSessionFlusher();
    const scope = new Scope();
    const hub = new Hub(client, scope);

    jest.spyOn<any, any>(client, '_captureRequestSession');
    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);

    sentryErrorMiddleware({ name: 'error', message: 'this is an error' }, req, res, next);
    const requestSession = scope?.getRequestSession();
    expect(requestSession).toEqual(undefined);
  });

  it('stores request in `sdkProcessingMetadata`', () => {
    const options = getDefaultNodeClientOptions({});
    client = new NodeClient(options);

    const hub = new Hub(client);
    mockAsyncContextStrategy(() => hub);
    // eslint-disable-next-line deprecation/deprecation
    makeMain(hub);

    // `sentryErrorMiddleware` uses `withScope`, and we need access to the temporary scope it creates, so monkeypatch
    // `captureException` in order to examine the scope as it exists inside the `withScope` callback
    // eslint-disable-next-line deprecation/deprecation
    hub.captureException = function (this: Hub, _exception: any) {
      // eslint-disable-next-line deprecation/deprecation
      const scope = this.getScope();
      expect((scope as any)._sdkProcessingMetadata.request).toEqual(req);
    } as any;

    sentryErrorMiddleware({ name: 'error', message: 'this is an error' }, req, res, next);

    expect.assertions(1);
  });
});
