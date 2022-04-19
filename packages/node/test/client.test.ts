import { Scope, SessionFlusher } from '@sentry/hub';

import { NodeClient } from '../src';
import { setupNodeTransport } from '../src/transports';
import { getDefaultNodeClientOptions } from './helper/node-client-options';

const PUBLIC_DSN = 'https://username@domain/123';

describe('NodeClient', () => {
  let client: NodeClient;

  afterEach(() => {
    if ('_sessionFlusher' in client) clearInterval((client as any)._sessionFlusher._intervalId);
    jest.restoreAllMocks();
  });

  describe('captureException', () => {
    test('when autoSessionTracking is enabled, and requestHandler is not used -> requestStatus should not be set', () => {
      const options = getDefaultNodeClientOptions({ dsn: PUBLIC_DSN, autoSessionTracking: true, release: '1.4' });
      client = new NodeClient(options, setupNodeTransport(options).transport);
      const scope = new Scope();
      scope.setRequestSession({ status: 'ok' });

      client.captureException(new Error('test exception'), undefined, scope);

      const requestSession = scope.getRequestSession();
      expect(requestSession!.status).toEqual('ok');
    });
    test('when autoSessionTracking is disabled -> requestStatus should not be set', () => {
      const options = getDefaultNodeClientOptions({ dsn: PUBLIC_DSN, autoSessionTracking: false, release: '1.4' });
      client = new NodeClient(options, setupNodeTransport(options).transport);
      // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
      // by the`requestHandler`)
      client.initSessionFlusher();

      const scope = new Scope();
      scope.setRequestSession({ status: 'ok' });

      client.captureException(new Error('test exception'), undefined, scope);

      const requestSession = scope.getRequestSession();
      expect(requestSession!.status).toEqual('ok');
    });
    test('when autoSessionTracking is enabled + requestSession status is Crashed -> requestStatus should not be overridden', () => {
      const options = getDefaultNodeClientOptions({ dsn: PUBLIC_DSN, autoSessionTracking: true, release: '1.4' });
      client = new NodeClient(options, setupNodeTransport(options).transport);
      // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
      // by the`requestHandler`)
      client.initSessionFlusher();

      const scope = new Scope();
      scope.setRequestSession({ status: 'crashed' });

      client.captureException(new Error('test exception'), undefined, scope);

      const requestSession = scope.getRequestSession();
      expect(requestSession!.status).toEqual('crashed');
    });
    test('when autoSessionTracking is enabled + error occurs within request bounds -> requestStatus should be set to Errored', () => {
      const options = getDefaultNodeClientOptions({ dsn: PUBLIC_DSN, autoSessionTracking: true, release: '1.4' });
      client = new NodeClient(options, setupNodeTransport(options).transport);
      // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
      // by the`requestHandler`)
      client.initSessionFlusher();

      const scope = new Scope();
      scope.setRequestSession({ status: 'ok' });

      client.captureException(new Error('test exception'), undefined, scope);

      const requestSession = scope.getRequestSession();
      expect(requestSession!.status).toEqual('errored');
    });
    test('when autoSessionTracking is enabled + error occurs outside of request bounds -> requestStatus should not be set to Errored', () => {
      const options = getDefaultNodeClientOptions({ dsn: PUBLIC_DSN, autoSessionTracking: true, release: '1.4' });
      client = new NodeClient(options, setupNodeTransport(options).transport);
      // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
      // by the`requestHandler`)
      client.initSessionFlusher();

      const scope = new Scope();

      client.captureException(new Error('test exception'), undefined, scope);

      const requestSession = scope.getRequestSession();
      expect(requestSession).toEqual(undefined);
    });
  });

  describe('captureEvent()', () => {
    test('If autoSessionTracking is disabled, requestSession status should not be set', () => {
      const options = getDefaultNodeClientOptions({ dsn: PUBLIC_DSN, autoSessionTracking: false, release: '1.4' });
      client = new NodeClient(options, setupNodeTransport(options).transport);
      // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
      // by the`requestHandler`)
      client.initSessionFlusher();

      const scope = new Scope();
      scope.setRequestSession({ status: 'ok' });
      client.captureEvent(
        { message: 'message', exception: { values: [{ type: 'exception type 1' }] } },
        undefined,
        scope,
      );

      const requestSession = scope.getRequestSession();
      expect(requestSession!.status).toEqual('ok');
    });

    test('When captureEvent is called with an exception, requestSession status should be set to Errored', () => {
      const options = getDefaultNodeClientOptions({ dsn: PUBLIC_DSN, autoSessionTracking: true, release: '2.2' });
      client = new NodeClient(options, setupNodeTransport(options).transport);
      // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
      // by the`requestHandler`)
      client.initSessionFlusher();

      const scope = new Scope();
      scope.setRequestSession({ status: 'ok' });

      client.captureEvent({ message: 'message', exception: { values: [{ type: 'exception type 1' }] } }, {}, scope);

      const requestSession = scope.getRequestSession();
      expect(requestSession!.status).toEqual('errored');
    });

    test('When captureEvent is called without an exception, requestSession status should not be set to Errored', () => {
      const options = getDefaultNodeClientOptions({ dsn: PUBLIC_DSN, autoSessionTracking: true, release: '2.2' });
      client = new NodeClient(options, setupNodeTransport(options).transport);
      // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
      // by the`requestHandler`)
      client.initSessionFlusher();

      const scope = new Scope();
      scope.setRequestSession({ status: 'ok' });

      client.captureEvent({ message: 'message' }, {}, scope);

      const requestSession = scope.getRequestSession();
      expect(requestSession!.status).toEqual('ok');
    });

    test('When captureEvent is called with an exception but outside of a request, then requestStatus should not be set', () => {
      const options = getDefaultNodeClientOptions({ dsn: PUBLIC_DSN, autoSessionTracking: true, release: '2.2' });
      client = new NodeClient(options, setupNodeTransport(options).transport);
      // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
      // by the`requestHandler`)
      client.initSessionFlusher();

      const scope = new Scope();

      client.captureEvent(
        { message: 'message', exception: { values: [{ type: 'exception type 1' }] } },
        undefined,
        scope,
      );

      expect(scope.getRequestSession()).toEqual(undefined);
    });

    test('When captureEvent is called with a transaction, then requestSession status should not be set', () => {
      const options = getDefaultNodeClientOptions({ dsn: PUBLIC_DSN, autoSessionTracking: true, release: '1.3' });
      client = new NodeClient(options, setupNodeTransport(options).transport);
      // It is required to initialise SessionFlusher to capture Session Aggregates (it is usually initialised
      // by the`requestHandler`)
      client.initSessionFlusher();

      const scope = new Scope();
      scope.setRequestSession({ status: 'ok' });
      client.captureEvent({ message: 'message', type: 'transaction' }, undefined, scope);

      const requestSession = scope.getRequestSession();
      expect(requestSession!.status).toEqual('ok');
    });

    test('When captureEvent is called with an exception but requestHandler is not used, then requestSession status should not be set', () => {
      const options = getDefaultNodeClientOptions({ dsn: PUBLIC_DSN, autoSessionTracking: true, release: '1.3' });
      client = new NodeClient(options, setupNodeTransport(options).transport);

      const scope = new Scope();
      scope.setRequestSession({ status: 'ok' });
      client.captureEvent(
        { message: 'message', exception: { values: [{ type: 'exception type 1' }] } },
        undefined,
        scope,
      );

      const requestSession = scope.getRequestSession();
      expect(requestSession!.status).toEqual('ok');
    });
  });
});

describe('flush/close', () => {
  test('client close function disables _sessionFlusher', async () => {
    jest.useRealTimers();
    const options = getDefaultNodeClientOptions({
      dsn: PUBLIC_DSN,
      autoSessionTracking: true,
      release: '1.1',
    });
    const client = new NodeClient(options, setupNodeTransport(options).transport);
    client.initSessionFlusher();
    // Clearing interval is important here to ensure that the flush function later on is called by the `client.close()`
    // not due to the interval running every 60s
    clearInterval((client as any)._sessionFlusher._intervalId);

    const sessionFlusherFlushFunc = jest.spyOn<any, any>(SessionFlusher.prototype, 'flush');

    const delay = 1;
    await client.close(delay);
    expect((client as any)._sessionFlusher._isEnabled).toBeFalsy();
    expect(sessionFlusherFlushFunc).toHaveBeenCalledTimes(1);
  });
});
