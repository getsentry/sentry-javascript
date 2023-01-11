import * as sentryCore from '@sentry/core';
import { Hub, makeMain, Scope } from '@sentry/core';
import { Transaction } from '@sentry/tracing';
import type { Event } from '@sentry/types';
import { SentryError } from '@sentry/utils';
import * as http from 'http';

import { NodeClient } from '../src/client';
import { errorHandler, requestHandler, tracingHandler } from '../src/handlers';
import * as SDK from '../src/sdk';
import { getDefaultNodeClientOptions } from './helper/node-client-options';

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

    sentryRequestMiddleware(req, res, next);

    const scope = sentryCore.getCurrentHub().getScope();
    expect(scope?.getRequestSession()).toEqual({ status: 'ok' });
  });

  it('autoSessionTracking is disabled, does not set requestSession, when handling a request', () => {
    const options = getDefaultNodeClientOptions({ autoSessionTracking: false, release: '1.2' });
    client = new NodeClient(options);
    const hub = new Hub(client);

    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);

    sentryRequestMiddleware(req, res, next);

    const scope = sentryCore.getCurrentHub().getScope();
    expect(scope?.getRequestSession()).toBeUndefined();
  });

  it('autoSessionTracking is enabled, calls _captureRequestSession, on response finish', done => {
    const options = getDefaultNodeClientOptions({ autoSessionTracking: true, release: '1.2' });
    client = new NodeClient(options);
    const hub = new Hub(client);

    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);

    const captureRequestSession = jest.spyOn<any, any>(client, '_captureRequestSession');

    sentryRequestMiddleware(req, res, next);

    const scope = sentryCore.getCurrentHub().getScope();
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

    const captureRequestSession = jest.spyOn<any, any>(client, '_captureRequestSession');

    sentryRequestMiddleware(req, res, next);
    const scope = sentryCore.getCurrentHub().getScope();
    res.emit('finish');

    setImmediate(() => {
      expect(scope?.getRequestSession()).toBeUndefined();
      expect(captureRequestSession).not.toHaveBeenCalled();
      done();
    });
  });

  it('patches `res.end` when `flushTimeout` is specified', done => {
    const flush = jest.spyOn(SDK, 'flush').mockResolvedValue(true);

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
    jest.spyOn(SDK, 'flush').mockRejectedValue(new SentryError('HTTP Error (429)'));

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

    const requestHandlerOptions = { include: { ip: false } };
    const sentryRequestMiddleware = requestHandler(requestHandlerOptions);

    sentryRequestMiddleware(req, res, next);

    const scope = sentryCore.getCurrentHub().getScope();
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
    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);
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

  it('creates a transaction when handling a request', () => {
    const startTransaction = jest.spyOn(sentryCore, 'startTransaction');

    sentryTracingMiddleware(req, res, next);

    expect(startTransaction).toHaveBeenCalled();
  });

  it("doesn't create a transaction when handling a `HEAD` request", () => {
    const startTransaction = jest.spyOn(sentryCore, 'startTransaction');
    req.method = 'HEAD';

    sentryTracingMiddleware(req, res, next);

    expect(startTransaction).not.toHaveBeenCalled();
  });

  it("doesn't create a transaction when handling an `OPTIONS` request", () => {
    const startTransaction = jest.spyOn(sentryCore, 'startTransaction');
    req.method = 'OPTIONS';

    sentryTracingMiddleware(req, res, next);

    expect(startTransaction).not.toHaveBeenCalled();
  });

  it("doesn't create a transaction if tracing is disabled", () => {
    delete hub.getClient()?.getOptions().tracesSampleRate;
    const startTransaction = jest.spyOn(sentryCore, 'startTransaction');

    sentryTracingMiddleware(req, res, next);

    expect(startTransaction).not.toHaveBeenCalled();
  });

  it("pulls parent's data from tracing header on the request", () => {
    req.headers = { 'sentry-trace': '12312012123120121231201212312012-1121201211212012-0' };

    sentryTracingMiddleware(req, res, next);

    const transaction = (res as any).__sentry_transaction;

    // since we have no tracesSampler defined, the default behavior (inherit if possible) applies
    expect(transaction.traceId).toEqual('12312012123120121231201212312012');
    expect(transaction.parentSpanId).toEqual('1121201211212012');
    expect(transaction.sampled).toEqual(false);
    expect(transaction.metadata?.dynamicSamplingContext).toStrictEqual({});
  });

  it("pulls parent's data from tracing and baggage headers on the request", () => {
    req.headers = {
      'sentry-trace': '12312012123120121231201212312012-1121201211212012-0',
      baggage: 'sentry-version=1.0,sentry-environment=production',
    };

    sentryTracingMiddleware(req, res, next);

    const transaction = (res as any).__sentry_transaction;

    // since we have no tracesSampler defined, the default behavior (inherit if possible) applies
    expect(transaction.traceId).toEqual('12312012123120121231201212312012');
    expect(transaction.parentSpanId).toEqual('1121201211212012');
    expect(transaction.sampled).toEqual(false);
    expect(transaction.metadata?.dynamicSamplingContext).toStrictEqual({ version: '1.0', environment: 'production' });
  });

  it("doesn't populate dynamic sampling context with 3rd party baggage", () => {
    req.headers = {
      'sentry-trace': '12312012123120121231201212312012-1121201211212012-0',
      baggage: 'sentry-version=1.0,sentry-environment=production,dogs=great,cats=boring',
    };

    sentryTracingMiddleware(req, res, next);

    const transaction = (res as any).__sentry_transaction;
    expect(transaction.metadata?.dynamicSamplingContext).toStrictEqual({ version: '1.0', environment: 'production' });
  });

  it('extracts request data for sampling context', () => {
    const tracesSampler = jest.fn();
    const options = getDefaultNodeClientOptions({ tracesSampler });
    const hub = new Hub(new NodeClient(options));
    hub.run(() => {
      sentryTracingMiddleware(req, res, next);

      expect(tracesSampler).toHaveBeenCalledWith(
        expect.objectContaining({
          request: {
            headers,
            method,
            url: `http://${hostname}${path}?${queryString}`,
            cookies: { favorite: 'zukes' },
            query_string: queryString,
          },
        }),
      );
    });
  });

  it('puts its transaction on the scope', () => {
    const options = getDefaultNodeClientOptions({ tracesSampleRate: 1.0 });
    const hub = new Hub(new NodeClient(options));

    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);

    sentryTracingMiddleware(req, res, next);

    const transaction = sentryCore.getCurrentHub().getScope()?.getTransaction();

    expect(transaction).toBeDefined();
    expect(transaction).toEqual(
      expect.objectContaining({ name: `${method.toUpperCase()} ${path}`, op: 'http.server' }),
    );
  });

  it('puts its transaction on the response object', () => {
    sentryTracingMiddleware(req, res, next);

    const transaction = (res as any).__sentry_transaction;

    expect(transaction).toBeDefined();
    expect(transaction).toEqual(
      expect.objectContaining({ name: `${method.toUpperCase()} ${path}`, op: 'http.server' }),
    );
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
      expect(transaction.status).toBe('ok');
      expect(transaction.tags).toEqual(expect.objectContaining({ 'http.status_code': '200' }));
      done();
    });
  });

  it('strips query string from request path', () => {
    req.url = `${path}?${queryString}`;

    sentryTracingMiddleware(req, res, next);

    const transaction = (res as any).__sentry_transaction;

    expect(transaction?.name).toBe(`${method.toUpperCase()} ${path}`);
  });

  it('strips fragment from request path', () => {
    req.url = `${path}${fragment}`;

    sentryTracingMiddleware(req, res, next);

    const transaction = (res as any).__sentry_transaction;

    expect(transaction?.name).toBe(`${method.toUpperCase()} ${path}`);
  });

  it('strips query string and fragment from request path', () => {
    req.url = `${path}?${queryString}${fragment}`;

    sentryTracingMiddleware(req, res, next);

    const transaction = (res as any).__sentry_transaction;

    expect(transaction?.name).toBe(`${method.toUpperCase()} ${path}`);
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

  it('stores request in transaction metadata', () => {
    const options = getDefaultNodeClientOptions({ tracesSampleRate: 1.0 });
    const hub = new Hub(new NodeClient(options));

    jest.spyOn(sentryCore, 'getCurrentHub').mockReturnValue(hub);

    sentryTracingMiddleware(req, res, next);

    const transaction = sentryCore.getCurrentHub().getScope()?.getTransaction();

    expect(transaction?.metadata.request).toEqual(req);
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

    const scope = sentryCore.getCurrentHub().getScope();
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

    const scope = sentryCore.getCurrentHub().getScope();
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

    jest.spyOn<any, any>(client, '_captureRequestSession');

    hub.run(() => {
      scope?.setRequestSession({ status: 'ok' });
      sentryErrorMiddleware({ name: 'error', message: 'this is an error' }, req, res, next);
      const requestSession = scope?.getRequestSession();
      expect(requestSession).toEqual({ status: 'crashed' });
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
    makeMain(hub);

    // `sentryErrorMiddleware` uses `withScope`, and we need access to the temporary scope it creates, so monkeypatch
    // `captureException` in order to examine the scope as it exists inside the `withScope` callback
    hub.captureException = function (this: Hub, _exception: any) {
      const scope = this.getScope();
      expect((scope as any)._sdkProcessingMetadata.request).toEqual(req);
    } as any;

    sentryErrorMiddleware({ name: 'error', message: 'this is an error' }, req, res, next);

    expect.assertions(1);
  });
});
