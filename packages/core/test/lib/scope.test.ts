import type { Breadcrumb, Client, Event, RequestSessionStatus } from '@sentry/types';
import {
  applyScopeDataToEvent,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  withIsolationScope,
  withScope,
} from '../../src';

import { Scope } from '../../src/scope';
import { TestClient, getDefaultTestClientOptions } from '../mocks/client';
import { clearGlobalScope } from './clear-global-scope';

describe('Scope', () => {
  beforeEach(() => {
    clearGlobalScope();
  });

  it('allows to create & update a scope', () => {
    const scope = new Scope();

    expect(scope.getScopeData()).toEqual({
      breadcrumbs: [],
      attachments: [],
      contexts: {},
      tags: {},
      extra: {},
      user: {},
      level: undefined,
      fingerprint: [],
      eventProcessors: [],
      propagationContext: {
        traceId: expect.any(String),
        spanId: expect.any(String),
      },
      sdkProcessingMetadata: {},
    });

    scope.update({
      tags: { foo: 'bar' },
      extra: { foo2: 'bar2' },
    });

    expect(scope.getScopeData()).toEqual({
      breadcrumbs: [],
      attachments: [],
      contexts: {},
      tags: {
        foo: 'bar',
      },
      extra: {
        foo2: 'bar2',
      },
      user: {},
      level: undefined,
      fingerprint: [],
      eventProcessors: [],
      propagationContext: {
        traceId: expect.any(String),
        spanId: expect.any(String),
      },
      sdkProcessingMetadata: {},
    });
  });

  it('allows to clone a scope', () => {
    const scope = new Scope();

    scope.update({
      tags: { foo: 'bar' },
      extra: { foo2: 'bar2' },
    });

    const newScope = scope.clone();
    expect(newScope).toBeInstanceOf(Scope);
    expect(newScope).not.toBe(scope);

    expect(newScope.getScopeData()).toEqual({
      breadcrumbs: [],
      attachments: [],
      contexts: {},
      tags: {
        foo: 'bar',
      },
      extra: {
        foo2: 'bar2',
      },
      user: {},
      level: undefined,
      fingerprint: [],
      eventProcessors: [],
      propagationContext: {
        traceId: expect.any(String),
        spanId: expect.any(String),
      },
      sdkProcessingMetadata: {},
    });
  });

  describe('init', () => {
    test('it creates a propagation context', () => {
      const scope = new Scope();

      expect(scope.getScopeData().propagationContext).toEqual({
        traceId: expect.any(String),
        spanId: expect.any(String),
        sampled: undefined,
        dsc: undefined,
        parentSpanId: undefined,
      });
    });
  });

  describe('attributes modification', () => {
    test('setFingerprint', () => {
      const scope = new Scope();
      scope.setFingerprint(['abcd']);
      expect(scope['_fingerprint']).toEqual(['abcd']);
    });

    test('setExtra', () => {
      const scope = new Scope();
      scope.setExtra('a', 1);
      expect(scope['_extra']).toEqual({ a: 1 });
    });

    test('setExtras', () => {
      const scope = new Scope();
      scope.setExtras({ a: 1 });
      expect(scope['_extra']).toEqual({ a: 1 });
    });

    test('setExtras with undefined overrides the value', () => {
      const scope = new Scope();
      scope.setExtra('a', 1);
      scope.setExtras({ a: undefined });
      expect(scope['_extra']).toEqual({ a: undefined });
    });

    test('setTag', () => {
      const scope = new Scope();
      scope.setTag('a', 'b');
      expect(scope['_tags']).toEqual({ a: 'b' });
    });

    test('setTags', () => {
      const scope = new Scope();
      scope.setTags({ a: 'b' });
      expect(scope['_tags']).toEqual({ a: 'b' });
    });

    test('setUser', () => {
      const scope = new Scope();
      scope.setUser({ id: '1' });
      expect(scope['_user']).toEqual({ id: '1' });
    });

    test('setUser with null unsets the user', () => {
      const scope = new Scope();
      scope.setUser({ id: '1' });
      scope.setUser(null);
      expect(scope['_user']).toEqual({});
    });

    test('addBreadcrumb', () => {
      const scope = new Scope();
      scope.addBreadcrumb({ message: 'test' });
      expect(scope['_breadcrumbs'][0]).toHaveProperty('message', 'test');
    });

    test('addBreadcrumb can be limited to hold up to N breadcrumbs', () => {
      const scope = new Scope();
      for (let i = 0; i < 10; i++) {
        scope.addBreadcrumb({ message: 'test' }, 5);
      }
      expect(scope['_breadcrumbs']).toHaveLength(5);
    });

    test('addBreadcrumb can go over DEFAULT_MAX_BREADCRUMBS value', () => {
      const scope = new Scope();
      for (let i = 0; i < 120; i++) {
        scope.addBreadcrumb({ message: 'test' }, 111);
      }
      expect(scope['_breadcrumbs']).toHaveLength(111);
    });

    test('setLevel', () => {
      const scope = new Scope();
      scope.setLevel('fatal');
      expect(scope['_level']).toEqual('fatal');
    });

    test('setContext', () => {
      const scope = new Scope();
      scope.setContext('os', { id: '1' });
      expect(scope['_contexts'].os).toEqual({ id: '1' });
    });

    test('setContext with null unsets it', () => {
      const scope = new Scope();
      scope.setContext('os', { id: '1' });
      scope.setContext('os', null);
      expect(scope['_user']).toEqual({});
    });

    test('setProcessingMetadata', () => {
      const scope = new Scope();
      scope.setSDKProcessingMetadata({ dogs: 'are great!' });
      expect(scope['_sdkProcessingMetadata'].dogs).toEqual('are great!');
    });

    test('set and get propagation context', () => {
      const scope = new Scope();
      const oldPropagationContext = scope.getPropagationContext();
      scope.setPropagationContext({
        traceId: '86f39e84263a4de99c326acab3bfe3bd',
        spanId: '6e0c63257de34c92',
        sampled: true,
      });
      expect(scope.getPropagationContext()).not.toEqual(oldPropagationContext);
      expect(scope.getPropagationContext()).toEqual({
        traceId: '86f39e84263a4de99c326acab3bfe3bd',
        spanId: '6e0c63257de34c92',
        sampled: true,
      });
    });

    test('chaining', () => {
      const scope = new Scope();
      scope.setLevel('fatal').setUser({ id: '1' });
      expect(scope['_level']).toEqual('fatal');
      expect(scope['_user']).toEqual({ id: '1' });
    });
  });

  describe('clone', () => {
    test('basic inheritance', () => {
      const parentScope = new Scope();
      parentScope.setExtra('a', 1);
      const scope = parentScope.clone();
      expect(parentScope['_extra']).toEqual(scope['_extra']);
    });

    test('_requestSession clone', () => {
      const parentScope = new Scope();
      parentScope.setRequestSession({ status: 'errored' });
      const scope = parentScope.clone();
      expect(parentScope.getRequestSession()).toEqual(scope.getRequestSession());
    });

    test('parent changed inheritance', () => {
      const parentScope = new Scope();
      const scope = parentScope.clone();
      parentScope.setExtra('a', 2);
      expect(scope['_extra']).toEqual({});
      expect(parentScope['_extra']).toEqual({ a: 2 });
    });

    test('child override inheritance', () => {
      const parentScope = new Scope();
      parentScope.setExtra('a', 1);

      const scope = parentScope.clone();
      scope.setExtra('a', 2);
      expect(parentScope['_extra']).toEqual({ a: 1 });
      expect(scope['_extra']).toEqual({ a: 2 });
    });

    test('child override should set the value of parent _requestSession', () => {
      // Test that ensures if the status value of `status` of `_requestSession` is changed in a child scope
      // that it should also change in parent scope because we are copying the reference to the object
      const parentScope = new Scope();
      parentScope.setRequestSession({ status: 'errored' });

      const scope = parentScope.clone();
      const requestSession = scope.getRequestSession();
      if (requestSession) {
        requestSession.status = 'ok';
      }

      expect(parentScope.getRequestSession()).toEqual({ status: 'ok' });
      expect(scope.getRequestSession()).toEqual({ status: 'ok' });
    });

    test('should clone propagation context', () => {
      const parentScope = new Scope();
      const scope = parentScope.clone();

      expect(scope.getScopeData().propagationContext).toEqual(parentScope.getScopeData().propagationContext);
    });
  });

  test('clear', () => {
    const scope = new Scope();
    const oldPropagationContext = scope.getScopeData().propagationContext;
    scope.setExtra('a', 2);
    scope.setTag('a', 'b');
    scope.setUser({ id: '1' });
    scope.setFingerprint(['abcd']);
    scope.addBreadcrumb({ message: 'test' });
    scope.setRequestSession({ status: 'ok' });
    expect(scope['_extra']).toEqual({ a: 2 });
    scope.clear();
    expect(scope['_extra']).toEqual({});
    expect(scope['_requestSession']).toEqual(undefined);
    expect(scope['_propagationContext']).toEqual({
      traceId: expect.any(String),
      spanId: expect.any(String),
      sampled: undefined,
    });
    expect(scope['_propagationContext']).not.toEqual(oldPropagationContext);
  });

  test('clearBreadcrumbs', () => {
    const scope = new Scope();
    scope.addBreadcrumb({ message: 'test' });
    expect(scope['_breadcrumbs']).toHaveLength(1);
    scope.clearBreadcrumbs();
    expect(scope['_breadcrumbs']).toHaveLength(0);
  });

  describe('update', () => {
    let scope: Scope;

    beforeEach(() => {
      scope = new Scope();
      scope.setTags({ foo: '1', bar: '2' });
      scope.setExtras({ foo: '1', bar: '2' });
      scope.setContext('foo', { id: '1' });
      scope.setContext('bar', { id: '2' });
      scope.setUser({ id: '1337' });
      scope.setLevel('info');
      scope.setFingerprint(['foo']);
      scope.setRequestSession({ status: 'ok' });
    });

    test('given no data, returns the original scope', () => {
      const updatedScope = scope.update();
      expect(updatedScope).toEqual(scope);
    });

    test('given neither function, Scope or plain object, returns original scope', () => {
      // @ts-expect-error we want to be able to update scope with string
      const updatedScope = scope.update('wat');
      expect(updatedScope).toEqual(scope);
    });

    test('given callback function, pass it the scope and returns original or modified scope', () => {
      const cb = jest
        .fn()
        .mockImplementationOnce(v => v)
        .mockImplementationOnce(v => {
          v.setTag('foo', 'bar');
          return v;
        });

      let updatedScope = scope.update(cb);
      expect(cb).toHaveBeenNthCalledWith(1, scope);
      expect(updatedScope).toEqual(scope);

      updatedScope = scope.update(cb);
      expect(cb).toHaveBeenNthCalledWith(2, scope);
      expect(updatedScope).toEqual(scope);
    });

    test('given callback function, when it doesnt return instanceof Scope, ignore it and return original scope', () => {
      const cb = jest.fn().mockImplementationOnce(_v => 'wat');
      const updatedScope = scope.update(cb);
      expect(cb).toHaveBeenCalledWith(scope);
      expect(updatedScope).toEqual(scope);
    });

    test('given another instance of Scope, it should merge two together, with the passed scope having priority', () => {
      const localScope = new Scope();
      localScope.setTags({ bar: '3', baz: '4' });
      localScope.setExtras({ bar: '3', baz: '4' });
      localScope.setContext('bar', { id: '3' });
      localScope.setContext('baz', { id: '4' });
      localScope.setUser({ id: '42' });
      localScope.setLevel('warning');
      localScope.setFingerprint(['bar']);
      (localScope as any)._requestSession = { status: 'ok' };

      const updatedScope = scope.update(localScope) as any;

      expect(updatedScope._tags).toEqual({
        bar: '3',
        baz: '4',
        foo: '1',
      });
      expect(updatedScope._extra).toEqual({
        bar: '3',
        baz: '4',
        foo: '1',
      });
      expect(updatedScope._contexts).toEqual({
        bar: { id: '3' },
        baz: { id: '4' },
        foo: { id: '1' },
      });
      expect(updatedScope._user).toEqual({ id: '42' });
      expect(updatedScope._level).toEqual('warning');
      expect(updatedScope._fingerprint).toEqual(['bar']);
      expect(updatedScope._requestSession.status).toEqual('ok');
      // @ts-expect-error accessing private property for test
      expect(updatedScope._propagationContext).toEqual(localScope._propagationContext);
    });

    test('given an empty instance of Scope, it should preserve all the original scope data', () => {
      const updatedScope = scope.update(new Scope()) as any;

      expect(updatedScope._tags).toEqual({
        bar: '2',
        foo: '1',
      });
      expect(updatedScope._extra).toEqual({
        bar: '2',
        foo: '1',
      });
      expect(updatedScope._contexts).toEqual({
        bar: { id: '2' },
        foo: { id: '1' },
      });
      expect(updatedScope._user).toEqual({ id: '1337' });
      expect(updatedScope._level).toEqual('info');
      expect(updatedScope._fingerprint).toEqual(['foo']);
      expect(updatedScope._requestSession.status).toEqual('ok');
    });

    test('given a plain object, it should merge two together, with the passed object having priority', () => {
      const localAttributes = {
        contexts: { bar: { id: '3' }, baz: { id: '4' } },
        extra: { bar: '3', baz: '4' },
        fingerprint: ['bar'],
        level: 'warning' as const,
        tags: { bar: '3', baz: '4' },
        user: { id: '42' },
        requestSession: { status: 'errored' as RequestSessionStatus },
        propagationContext: {
          traceId: '8949daf83f4a4a70bee4c1eb9ab242ed',
          spanId: 'a024ad8fea82680e',
          sampled: true,
        },
      };

      const updatedScope = scope.update(localAttributes) as any;

      expect(updatedScope._tags).toEqual({
        bar: '3',
        baz: '4',
        foo: '1',
      });
      expect(updatedScope._extra).toEqual({
        bar: '3',
        baz: '4',
        foo: '1',
      });
      expect(updatedScope._contexts).toEqual({
        bar: { id: '3' },
        baz: { id: '4' },
        foo: { id: '1' },
      });
      expect(updatedScope._user).toEqual({ id: '42' });
      expect(updatedScope._level).toEqual('warning');
      expect(updatedScope._fingerprint).toEqual(['bar']);
      expect(updatedScope._requestSession).toEqual({ status: 'errored' });
      expect(updatedScope._propagationContext).toEqual({
        traceId: '8949daf83f4a4a70bee4c1eb9ab242ed',
        spanId: 'a024ad8fea82680e',
        sampled: true,
      });
    });
  });

  describe('global scope', () => {
    beforeEach(() => {
      clearGlobalScope();
    });

    it('works', () => {
      const globalScope = getGlobalScope();
      expect(globalScope).toBeDefined();
      expect(globalScope).toBeInstanceOf(Scope);

      // Repeatedly returns the same instance
      expect(getGlobalScope()).toBe(globalScope);

      globalScope.setTag('tag1', 'val1');
      globalScope.setTag('tag2', 'val2');

      expect(globalScope.getScopeData().tags).toEqual({ tag1: 'val1', tag2: 'val2' });
    });
  });

  describe('applyScopeDataToEvent', () => {
    it('works without any data', async () => {
      const scope = new Scope();

      const event = { message: 'foo' };
      applyScopeDataToEvent(event, scope.getScopeData());

      expect(event).toEqual({
        message: 'foo',
        sdkProcessingMetadata: {},
      });
    });

    it('works with data', async () => {
      const breadcrumb1 = { message: '1', timestamp: 111 } as Breadcrumb;
      const breadcrumb2 = { message: '1', timestamp: 111 } as Breadcrumb;

      const scope = new Scope();
      scope.update({
        user: { id: '1', email: 'test@example.com' },
        tags: { tag1: 'aa', tag2: 'aa' },
        extra: { extra1: 'aa', extra2: 'aa' },
        contexts: { os: { name: 'os1' }, culture: { display_name: 'name1' } },
        propagationContext: { spanId: '1', traceId: '1' },
        fingerprint: ['aa'],
      });
      scope.addBreadcrumb(breadcrumb1);
      scope.setSDKProcessingMetadata({ aa: 'aa' });

      const event = { message: 'foo', breadcrumbs: [breadcrumb2], fingerprint: ['dd'] };

      applyScopeDataToEvent(event, scope.getScopeData());

      expect(event).toEqual({
        message: 'foo',
        user: { id: '1', email: 'test@example.com' },
        tags: { tag1: 'aa', tag2: 'aa' },
        extra: { extra1: 'aa', extra2: 'aa' },
        contexts: {
          os: { name: 'os1' },
          culture: { display_name: 'name1' },
        },
        fingerprint: ['dd', 'aa'],
        breadcrumbs: [breadcrumb2, breadcrumb1],
        sdkProcessingMetadata: {
          aa: 'aa',
        },
      });
    });
  });

  describe('setClient() and getClient()', () => {
    it('allows storing and retrieving client objects', () => {
      const fakeClient = {} as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);
      expect(scope.getClient()).toBe(fakeClient);
    });

    it('defaults to not having a client', () => {
      const scope = new Scope();
      expect(scope.getClient()).toBeUndefined();
    });
  });

  describe('.clone()', () => {
    it('will clone a client on the scope', () => {
      const fakeClient = {} as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      const clonedScope = scope.clone();
      expect(clonedScope.getClient()).toBe(fakeClient);
    });
  });

  describe('.captureException()', () => {
    it('should call captureException() on client with newly generated event ID if not explicitly passed in', () => {
      const fakeCaptureException = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureException: fakeCaptureException,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      const exception = new Error();

      scope.captureException(exception);

      expect(fakeCaptureException).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ event_id: expect.any(String) }),
        scope,
      );
    });

    it('should return event ID when no client is on the scope', () => {
      const scope = new Scope();

      const exception = new Error();

      const eventId = scope.captureException(exception);

      expect(eventId).toEqual(expect.any(String));
    });

    it('should pass exception to captureException() on client', () => {
      const fakeCaptureException = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureException: fakeCaptureException,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      const exception = new Error();

      scope.captureException(exception);

      expect(fakeCaptureException).toHaveBeenCalledWith(exception, expect.anything(), scope);
    });

    it('should call captureException() on client with a synthetic exception', () => {
      const fakeCaptureException = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureException: fakeCaptureException,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      scope.captureException(new Error());

      expect(fakeCaptureException).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ syntheticException: expect.any(Error) }),
        scope,
      );
    });

    it('should pass the original exception to captureException() on client', () => {
      const fakeCaptureException = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureException: fakeCaptureException,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      const exception = new Error();
      scope.captureException(exception);

      expect(fakeCaptureException).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ originalException: exception }),
        scope,
      );
    });

    it('should forward hint to captureException() on client', () => {
      const fakeCaptureException = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureException: fakeCaptureException,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      scope.captureException(new Error(), { event_id: 'asdf', data: { foo: 'bar' } });

      expect(fakeCaptureException).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ event_id: 'asdf', data: { foo: 'bar' } }),
        scope,
      );
    });
  });

  describe('.captureMessage()', () => {
    it('should call captureMessage() on client with newly generated event ID if not explicitly passed in', () => {
      const fakeCaptureMessage = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureMessage: fakeCaptureMessage,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      scope.captureMessage('foo');

      expect(fakeCaptureMessage).toHaveBeenCalledWith(
        expect.anything(),
        undefined,
        expect.objectContaining({ event_id: expect.any(String) }),
        scope,
      );
    });

    it('should return event ID when no client is on the scope', () => {
      const scope = new Scope();

      const eventId = scope.captureMessage('foo');

      expect(eventId).toEqual(expect.any(String));
    });

    it('should pass exception to captureMessage() on client', () => {
      const fakeCaptureMessage = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureMessage: fakeCaptureMessage,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      scope.captureMessage('bar');

      expect(fakeCaptureMessage).toHaveBeenCalledWith('bar', undefined, expect.anything(), scope);
    });

    it('should call captureMessage() on client with a synthetic exception', () => {
      const fakeCaptureMessage = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureMessage: fakeCaptureMessage,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      scope.captureMessage('foo');

      expect(fakeCaptureMessage).toHaveBeenCalledWith(
        expect.anything(),
        undefined,
        expect.objectContaining({ syntheticException: expect.any(Error) }),
        scope,
      );
    });

    it('should pass the original exception to captureMessage() on client', () => {
      const fakeCaptureMessage = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureMessage: fakeCaptureMessage,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      scope.captureMessage('baz');

      expect(fakeCaptureMessage).toHaveBeenCalledWith(
        expect.anything(),
        undefined,
        expect.objectContaining({ originalException: 'baz' }),
        scope,
      );
    });

    it('should forward level and hint to captureMessage() on client', () => {
      const fakeCaptureMessage = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureMessage: fakeCaptureMessage,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      scope.captureMessage('asdf', 'fatal', { event_id: 'asdf', data: { foo: 'bar' } });

      expect(fakeCaptureMessage).toHaveBeenCalledWith(
        expect.anything(),
        'fatal',
        expect.objectContaining({ event_id: 'asdf', data: { foo: 'bar' } }),
        scope,
      );
    });
  });

  describe('.captureEvent()', () => {
    it('should call captureEvent() on client with newly generated event ID if not explicitly passed in', () => {
      const fakeCaptureEvent = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureEvent: fakeCaptureEvent,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      scope.captureEvent({});

      expect(fakeCaptureEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ event_id: expect.any(String) }),
        scope,
      );
    });

    it('should return event ID when no client is on the scope', () => {
      const scope = new Scope();

      const eventId = scope.captureEvent({});

      expect(eventId).toEqual(expect.any(String));
    });

    it('should pass event to captureEvent() on client', () => {
      const fakeCaptureEvent = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureEvent: fakeCaptureEvent,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      const event: Event = { event_id: 'asdf' };

      scope.captureEvent(event);

      expect(fakeCaptureEvent).toHaveBeenCalledWith(event, expect.anything(), scope);
    });

    it('should forward hint to captureEvent() on client', () => {
      const fakeCaptureEvent = jest.fn(() => 'mock-event-id');
      const fakeClient = {
        captureEvent: fakeCaptureEvent,
      } as unknown as Client;
      const scope = new Scope();
      scope.setClient(fakeClient);

      scope.captureEvent({}, { event_id: 'asdf', data: { foo: 'bar' } });

      expect(fakeCaptureEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ event_id: 'asdf', data: { foo: 'bar' } }),
        scope,
      );
    });
  });

  describe('addBreadcrumb()', () => {
    test('adds a breadcrumb', () => {
      const scope = new Scope();

      scope.addBreadcrumb({ message: 'hello world' }, 100);

      expect((scope as any)._breadcrumbs[0].message).toEqual('hello world');
    });

    test('adds a timestamp to new breadcrumbs', () => {
      const scope = new Scope();

      scope.addBreadcrumb({ message: 'hello world' }, 100);

      expect((scope as any)._breadcrumbs[0].timestamp).toEqual(expect.any(Number));
    });

    test('overrides the `maxBreadcrumbs` defined in client options', () => {
      const options = getDefaultTestClientOptions({ maxBreadcrumbs: 1 });
      const client = new TestClient(options);
      const scope = new Scope();

      scope.setClient(client);

      scope.addBreadcrumb({ message: 'hello' }, 100);
      scope.addBreadcrumb({ message: 'world' }, 100);
      scope.addBreadcrumb({ message: '!' }, 100);

      expect((scope as any)._breadcrumbs).toHaveLength(3);
    });
  });
});

describe('withScope()', () => {
  beforeEach(() => {
    getIsolationScope().clear();
    getCurrentScope().clear();
    getGlobalScope().clear();
  });

  it('will make the passed scope the active scope within the callback', done => {
    withScope(scope => {
      expect(getCurrentScope()).toBe(scope);
      done();
    });
  });

  it('will pass a scope that is different from the current active isolation scope', done => {
    withScope(scope => {
      expect(getIsolationScope()).not.toBe(scope);
      done();
    });
  });

  it('will always make the inner most passed scope the current isolation scope when nesting calls', done => {
    withIsolationScope(_scope1 => {
      withIsolationScope(scope2 => {
        expect(getIsolationScope()).toBe(scope2);
        done();
      });
    });
  });

  it('forks the scope when not passing any scope', done => {
    const initialScope = getCurrentScope();
    initialScope.setTag('aa', 'aa');

    withScope(scope => {
      expect(getCurrentScope()).toBe(scope);
      scope.setTag('bb', 'bb');
      expect(scope).not.toBe(initialScope);
      expect(scope.getScopeData().tags).toEqual({ aa: 'aa', bb: 'bb' });
      done();
    });
  });

  it('forks the scope when passing undefined', done => {
    const initialScope = getCurrentScope();
    initialScope.setTag('aa', 'aa');

    withScope(undefined, scope => {
      expect(getCurrentScope()).toBe(scope);
      scope.setTag('bb', 'bb');
      expect(scope).not.toBe(initialScope);
      expect(scope.getScopeData().tags).toEqual({ aa: 'aa', bb: 'bb' });
      done();
    });
  });

  it('sets the passed in scope as active scope', done => {
    const initialScope = getCurrentScope();
    initialScope.setTag('aa', 'aa');

    const customScope = new Scope();

    withScope(customScope, scope => {
      expect(getCurrentScope()).toBe(customScope);
      expect(scope).toBe(customScope);
      done();
    });
  });
});

describe('withIsolationScope()', () => {
  beforeEach(() => {
    getIsolationScope().clear();
    getCurrentScope().clear();
    getGlobalScope().clear();
  });

  it('will make the passed isolation scope the active isolation scope within the callback', done => {
    withIsolationScope(scope => {
      expect(getIsolationScope()).toBe(scope);
      done();
    });
  });

  it('will pass an isolation scope that is different from the current active scope', done => {
    withIsolationScope(scope => {
      expect(getCurrentScope()).not.toBe(scope);
      done();
    });
  });

  it('will always make the inner most passed scope the current scope when nesting calls', done => {
    withIsolationScope(_scope1 => {
      withIsolationScope(scope2 => {
        expect(getIsolationScope()).toBe(scope2);
        done();
      });
    });
  });

  // Note: This is expected! In browser, we do not actually fork this
  it('does not fork isolation scope when not passing any isolation scope', done => {
    const isolationScope = getIsolationScope();

    withIsolationScope(scope => {
      expect(getIsolationScope()).toBe(scope);
      expect(scope).toBe(isolationScope);
      done();
    });
  });

  it('does not fork isolation scope when passing undefined', done => {
    const isolationScope = getIsolationScope();

    withIsolationScope(undefined, scope => {
      expect(getIsolationScope()).toBe(scope);
      expect(scope).toBe(isolationScope);
      done();
    });
  });

  it('ignores passed in isolation scope', done => {
    const isolationScope = getIsolationScope();
    const customIsolationScope = new Scope();

    withIsolationScope(customIsolationScope, scope => {
      expect(getIsolationScope()).toBe(isolationScope);
      expect(scope).toBe(isolationScope);
      done();
    });
  });
});
