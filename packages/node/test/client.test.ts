import { Scope, SessionFlusher } from '@sentry/core';
import type { Event, EventHint } from '@sentry/types';
import * as os from 'os';

import { NodeClient } from '../src';
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
      client = new NodeClient(options);
      const scope = new Scope();
      scope.setRequestSession({ status: 'ok' });

      client.captureException(new Error('test exception'), undefined, scope);

      const requestSession = scope.getRequestSession();
      expect(requestSession!.status).toEqual('ok');
    });

    test('when autoSessionTracking is disabled -> requestStatus should not be set', () => {
      const options = getDefaultNodeClientOptions({ dsn: PUBLIC_DSN, autoSessionTracking: false, release: '1.4' });
      client = new NodeClient(options);
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
      client = new NodeClient(options);
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
      client = new NodeClient(options);
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
      client = new NodeClient(options);
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
      client = new NodeClient(options);
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
      client = new NodeClient(options);
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
      client = new NodeClient(options);
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
      client = new NodeClient(options);
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
      client = new NodeClient(options);
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
      client = new NodeClient(options);

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

  describe('_prepareEvent', () => {
    test('adds platform to event', () => {
      const options = getDefaultNodeClientOptions({ dsn: PUBLIC_DSN });
      client = new NodeClient(options);

      const event: Event = {};
      const hint: EventHint = {};
      (client as any)._prepareEvent(event, hint);

      expect(event.platform).toEqual('node');
    });

    test('adds runtime context to event', () => {
      const options = getDefaultNodeClientOptions({ dsn: PUBLIC_DSN });
      client = new NodeClient(options);

      const event: Event = {};
      const hint: EventHint = {};
      (client as any)._prepareEvent(event, hint);

      expect(event.contexts?.runtime).toEqual({
        name: 'node',
        version: process.version,
      });
    });

    test('adds server name to event when value passed in options', () => {
      const options = getDefaultNodeClientOptions({ dsn: PUBLIC_DSN, serverName: 'foo' });
      client = new NodeClient(options);

      const event: Event = {};
      const hint: EventHint = {};
      (client as any)._prepareEvent(event, hint);

      expect(event.server_name).toEqual('foo');
    });

    test('adds server name to event when value given in env', () => {
      const options = getDefaultNodeClientOptions({ dsn: PUBLIC_DSN });
      client = new NodeClient(options);
      process.env.SENTRY_NAME = 'foo';

      const event: Event = {};
      const hint: EventHint = {};
      (client as any)._prepareEvent(event, hint);

      expect(event.server_name).toEqual('foo');

      delete process.env.SENTRY_NAME;
    });

    test('adds hostname as event server name when no value given', () => {
      const options = getDefaultNodeClientOptions({ dsn: PUBLIC_DSN });
      client = new NodeClient(options);

      const event: Event = {};
      const hint: EventHint = {};
      (client as any)._prepareEvent(event, hint);

      expect(event.server_name).toEqual(os.hostname());
    });

    test("doesn't clobber existing runtime data", () => {
      const options = getDefaultNodeClientOptions({ dsn: PUBLIC_DSN, serverName: 'bar' });
      client = new NodeClient(options);

      const event: Event = { contexts: { runtime: { name: 'foo', version: '1.2.3' } } };
      const hint: EventHint = {};
      (client as any)._prepareEvent(event, hint);

      expect(event.contexts?.runtime).toEqual({ name: 'foo', version: '1.2.3' });
      expect(event.contexts?.runtime).not.toEqual({ name: 'node', version: process.version });
    });

    test("doesn't clobber existing server name", () => {
      const options = getDefaultNodeClientOptions({ dsn: PUBLIC_DSN, serverName: 'bar' });
      client = new NodeClient(options);

      const event: Event = { server_name: 'foo' };
      const hint: EventHint = {};
      (client as any)._prepareEvent(event, hint);

      expect(event.server_name).toEqual('foo');
      expect(event.server_name).not.toEqual('bar');
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
    const client = new NodeClient(options);
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
