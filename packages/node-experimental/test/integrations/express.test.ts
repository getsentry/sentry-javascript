import * as http from 'http';
import { getCurrentScope, getIsolationScope, setAsyncContextStrategy, setCurrentClient, withScope } from '@sentry/core';
import type { Scope } from '@sentry/types';
import { expressErrorHandler } from '../../src/integrations/tracing/express';
import { NodeClient } from '../../src/sdk/client';
import { getDefaultNodeClientOptions } from '../helpers/getDefaultNodeClientOptions';

describe('expressErrorHandler()', () => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();

    setAsyncContextStrategy(undefined);
  });

  const headers = { ears: 'furry', nose: 'wet', tongue: 'spotted', cookie: 'favorite=zukes' };
  const method = 'wagging';
  const protocol = 'mutualsniffing';
  const hostname = 'the.dog.park';
  const path = '/by/the/trees/';
  const queryString = 'chase=me&please=thankyou';

  const sentryErrorMiddleware = expressErrorHandler();

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
    if (client['_sessionFlusher']) {
      clearInterval(client['_sessionFlusher']['_intervalId']);
    }
    jest.restoreAllMocks();
  });
  it('when autoSessionTracking is disabled, does not set requestSession status on Crash', done => {
    const options = getDefaultNodeClientOptions({ autoSessionTracking: false, release: '3.3' });
    client = new NodeClient(options);
    // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
    // by the`requestHandler`)
    client.initSessionFlusher();

    setCurrentClient(client);

    jest.spyOn<any, any>(client, '_captureRequestSession');

    getIsolationScope().setRequestSession({ status: 'ok' });

    let isolationScope: Scope;
    sentryErrorMiddleware({ name: 'error', message: 'this is an error' }, req, res, () => {
      isolationScope = getIsolationScope();
      return next();
    });

    setImmediate(() => {
      expect(isolationScope.getRequestSession()).toEqual({ status: 'ok' });
      done();
    });
  });

  it('autoSessionTracking is enabled + requestHandler is not used -> does not set requestSession status on Crash', done => {
    const options = getDefaultNodeClientOptions({ autoSessionTracking: false, release: '3.3' });
    client = new NodeClient(options);
    setCurrentClient(client);

    jest.spyOn<any, any>(client, '_captureRequestSession');

    getIsolationScope().setRequestSession({ status: 'ok' });

    let isolationScope: Scope;
    sentryErrorMiddleware({ name: 'error', message: 'this is an error' }, req, res, () => {
      isolationScope = getIsolationScope();
      return next();
    });

    setImmediate(() => {
      expect(isolationScope.getRequestSession()).toEqual({ status: 'ok' });
      done();
    });
  });

  it('when autoSessionTracking is enabled, should set requestSession status to Crashed when an unhandled error occurs within the bounds of a request', () => {
    const options = getDefaultNodeClientOptions({ autoSessionTracking: true, release: '1.1' });
    client = new NodeClient(options);
    // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
    // by the`requestHandler`)
    client.initSessionFlusher();

    setCurrentClient(client);

    jest.spyOn<any, any>(client, '_captureRequestSession');

    withScope(() => {
      getIsolationScope().setRequestSession({ status: 'ok' });
      sentryErrorMiddleware({ name: 'error', message: 'this is an error' }, req, res, () => {
        expect(getIsolationScope().getRequestSession()).toEqual({ status: 'crashed' });
      });
    });
  });

  it('when autoSessionTracking is enabled, should not set requestSession status on Crash when it occurs outside the bounds of a request', done => {
    const options = getDefaultNodeClientOptions({ autoSessionTracking: true, release: '2.2' });
    client = new NodeClient(options);
    // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
    // by the`requestHandler`)
    client.initSessionFlusher();
    setCurrentClient(client);

    jest.spyOn<any, any>(client, '_captureRequestSession');

    let isolationScope: Scope;
    sentryErrorMiddleware({ name: 'error', message: 'this is an error' }, req, res, () => {
      isolationScope = getIsolationScope();
      return next();
    });

    setImmediate(() => {
      expect(isolationScope.getRequestSession()).toEqual(undefined);
      done();
    });
  });
});
