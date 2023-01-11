/* eslint-disable deprecation/deprecation */

import type { Event, EventHint, RequestSessionStatus } from '@sentry/types';
import { GLOBAL_OBJ } from '@sentry/utils';

import { addGlobalEventProcessor, Scope } from '../src';

describe('Scope', () => {
  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
    GLOBAL_OBJ.__SENTRY__.globalEventProcessors = undefined;
  });

  describe('attributes modification', () => {
    test('setFingerprint', () => {
      const scope = new Scope();
      scope.setFingerprint(['abcd']);
      expect((scope as any)._fingerprint).toEqual(['abcd']);
    });

    test('setExtra', () => {
      const scope = new Scope();
      scope.setExtra('a', 1);
      expect((scope as any)._extra).toEqual({ a: 1 });
    });

    test('setExtras', () => {
      const scope = new Scope();
      scope.setExtras({ a: 1 });
      expect((scope as any)._extra).toEqual({ a: 1 });
    });

    test('setExtras with undefined overrides the value', () => {
      const scope = new Scope();
      scope.setExtra('a', 1);
      scope.setExtras({ a: undefined });
      expect((scope as any)._extra).toEqual({ a: undefined });
    });

    test('setTag', () => {
      const scope = new Scope();
      scope.setTag('a', 'b');
      expect((scope as any)._tags).toEqual({ a: 'b' });
    });

    test('setTags', () => {
      const scope = new Scope();
      scope.setTags({ a: 'b' });
      expect((scope as any)._tags).toEqual({ a: 'b' });
    });

    test('setUser', () => {
      const scope = new Scope();
      scope.setUser({ id: '1' });
      expect((scope as any)._user).toEqual({ id: '1' });
    });

    test('setUser with null unsets the user', () => {
      const scope = new Scope();
      scope.setUser({ id: '1' });
      scope.setUser(null);
      expect((scope as any)._user).toEqual({});
    });

    test('addBreadcrumb', () => {
      const scope = new Scope();
      scope.addBreadcrumb({ message: 'test' });
      expect((scope as any)._breadcrumbs[0]).toHaveProperty('message', 'test');
    });

    test('addBreadcrumb can be limited to hold up to N breadcrumbs', () => {
      const scope = new Scope();
      for (let i = 0; i < 10; i++) {
        scope.addBreadcrumb({ message: 'test' }, 5);
      }
      expect((scope as any)._breadcrumbs).toHaveLength(5);
    });

    test('addBreadcrumb can go over DEFAULT_MAX_BREADCRUMBS value', () => {
      const scope = new Scope();
      for (let i = 0; i < 120; i++) {
        scope.addBreadcrumb({ message: 'test' }, 111);
      }
      expect((scope as any)._breadcrumbs).toHaveLength(111);
    });

    test('setLevel', () => {
      const scope = new Scope();
      scope.setLevel('fatal');
      expect((scope as any)._level).toEqual('fatal');
    });

    test('setTransactionName', () => {
      const scope = new Scope();
      scope.setTransactionName('/abc');
      expect((scope as any)._transactionName).toEqual('/abc');
    });

    test('setTransactionName with no value unsets it', () => {
      const scope = new Scope();
      scope.setTransactionName('/abc');
      scope.setTransactionName();
      expect((scope as any)._transactionName).toBeUndefined();
    });

    test('setContext', () => {
      const scope = new Scope();
      scope.setContext('os', { id: '1' });
      expect((scope as any)._contexts.os).toEqual({ id: '1' });
    });

    test('setContext with null unsets it', () => {
      const scope = new Scope();
      scope.setContext('os', { id: '1' });
      scope.setContext('os', null);
      expect((scope as any)._user).toEqual({});
    });

    test('setSpan', () => {
      const scope = new Scope();
      const span = { fake: 'span' } as any;
      scope.setSpan(span);
      expect((scope as any)._span).toEqual(span);
    });

    test('setSpan with no value unsets it', () => {
      const scope = new Scope();
      scope.setSpan({ fake: 'span' } as any);
      scope.setSpan();
      expect((scope as any)._span).toEqual(undefined);
    });

    test('setProcessingMetadata', () => {
      const scope = new Scope();
      scope.setSDKProcessingMetadata({ dogs: 'are great!' });
      expect((scope as any)._sdkProcessingMetadata.dogs).toEqual('are great!');
    });

    test('chaining', () => {
      const scope = new Scope();
      scope.setLevel('fatal').setUser({ id: '1' });
      expect((scope as any)._level).toEqual('fatal');
      expect((scope as any)._user).toEqual({ id: '1' });
    });
  });

  describe('clone', () => {
    test('basic inheritance', () => {
      const parentScope = new Scope();
      parentScope.setExtra('a', 1);
      const scope = Scope.clone(parentScope);
      expect((parentScope as any)._extra).toEqual((scope as any)._extra);
    });

    test('_requestSession clone', () => {
      const parentScope = new Scope();
      parentScope.setRequestSession({ status: 'errored' });
      const scope = Scope.clone(parentScope);
      expect(parentScope.getRequestSession()).toEqual(scope.getRequestSession());
    });

    test('parent changed inheritance', () => {
      const parentScope = new Scope();
      const scope = Scope.clone(parentScope);
      parentScope.setExtra('a', 2);
      expect((scope as any)._extra).toEqual({});
      expect((parentScope as any)._extra).toEqual({ a: 2 });
    });

    test('child override inheritance', () => {
      const parentScope = new Scope();
      parentScope.setExtra('a', 1);

      const scope = Scope.clone(parentScope);
      scope.setExtra('a', 2);
      expect((parentScope as any)._extra).toEqual({ a: 1 });
      expect((scope as any)._extra).toEqual({ a: 2 });
    });

    test('child override should set the value of parent _requestSession', () => {
      // Test that ensures if the status value of `status` of `_requestSession` is changed in a child scope
      // that it should also change in parent scope because we are copying the reference to the object
      const parentScope = new Scope();
      parentScope.setRequestSession({ status: 'errored' });

      const scope = Scope.clone(parentScope);
      const requestSession = scope.getRequestSession();
      if (requestSession) {
        requestSession.status = 'ok';
      }

      expect(parentScope.getRequestSession()).toEqual({ status: 'ok' });
      expect(scope.getRequestSession()).toEqual({ status: 'ok' });
    });
  });

  describe('applyToEvent', () => {
    test('basic usage', async () => {
      expect.assertions(9);

      const scope = new Scope();
      scope.setExtra('a', 2);
      scope.setTag('a', 'b');
      scope.setUser({ id: '1' });
      scope.setFingerprint(['abcd']);
      scope.setLevel('warning');
      scope.setTransactionName('/abc');
      scope.addBreadcrumb({ message: 'test' });
      scope.setContext('os', { id: '1' });
      scope.setSDKProcessingMetadata({ dogs: 'are great!' });

      const event: Event = {};
      return scope.applyToEvent(event).then(processedEvent => {
        expect(processedEvent!.extra).toEqual({ a: 2 });
        expect(processedEvent!.tags).toEqual({ a: 'b' });
        expect(processedEvent!.user).toEqual({ id: '1' });
        expect(processedEvent!.fingerprint).toEqual(['abcd']);
        expect(processedEvent!.level).toEqual('warning');
        expect(processedEvent!.transaction).toEqual('/abc');
        expect(processedEvent!.breadcrumbs![0]).toHaveProperty('message', 'test');
        expect(processedEvent!.contexts).toEqual({ os: { id: '1' } });
        expect(processedEvent!.sdkProcessingMetadata).toEqual({ dogs: 'are great!' });
      });
    });

    test('merge with existing event data', async () => {
      expect.assertions(8);
      const scope = new Scope();
      scope.setExtra('a', 2);
      scope.setTag('a', 'b');
      scope.setUser({ id: '1' });
      scope.setFingerprint(['abcd']);
      scope.addBreadcrumb({ message: 'test' });
      scope.setContext('server', { id: '2' });
      const event: Event = {
        breadcrumbs: [{ message: 'test1' }],
        contexts: { os: { id: '1' } },
        extra: { b: 3 },
        fingerprint: ['efgh'],
        tags: { b: 'c' },
        user: { id: '3' },
      };
      return scope.applyToEvent(event).then(processedEvent => {
        expect(processedEvent!.extra).toEqual({ a: 2, b: 3 });
        expect(processedEvent!.tags).toEqual({ a: 'b', b: 'c' });
        expect(processedEvent!.user).toEqual({ id: '3' });
        expect(processedEvent!.fingerprint).toEqual(['efgh', 'abcd']);
        expect(processedEvent!.breadcrumbs).toHaveLength(2);
        expect(processedEvent!.breadcrumbs![0]).toHaveProperty('message', 'test1');
        expect(processedEvent!.breadcrumbs![1]).toHaveProperty('message', 'test');
        expect(processedEvent!.contexts).toEqual({
          os: { id: '1' },
          server: { id: '2' },
        });
      });
    });

    test('should make sure that fingerprint is always array', async () => {
      const scope = new Scope();
      const event: Event = {};

      // @ts-ignore we want to be able to assign string value
      event.fingerprint = 'foo';
      await scope.applyToEvent(event).then(processedEvent => {
        expect(processedEvent!.fingerprint).toEqual(['foo']);
      });

      // @ts-ignore we want to be able to assign string value
      event.fingerprint = 'bar';
      await scope.applyToEvent(event).then(processedEvent => {
        expect(processedEvent!.fingerprint).toEqual(['bar']);
      });
    });

    test('should merge fingerprint from event and scope', async () => {
      const scope = new Scope();
      scope.setFingerprint(['foo']);
      const event: Event = {
        fingerprint: ['bar'],
      };

      await scope.applyToEvent(event).then(processedEvent => {
        expect(processedEvent!.fingerprint).toEqual(['bar', 'foo']);
      });
    });

    test('should remove default empty fingerprint array if theres no data available', async () => {
      const scope = new Scope();
      const event: Event = {};
      await scope.applyToEvent(event).then(processedEvent => {
        expect(processedEvent!.fingerprint).toEqual(undefined);
      });
    });

    test('scope level should have priority over event level', async () => {
      expect.assertions(1);
      const scope = new Scope();
      scope.setLevel('warning');
      const event: Event = {};
      event.level = 'fatal';
      return scope.applyToEvent(event).then(processedEvent => {
        expect(processedEvent!.level).toEqual('warning');
      });
    });

    test('scope transaction should have priority over event transaction', async () => {
      expect.assertions(1);
      const scope = new Scope();
      scope.setTransactionName('/abc');
      const event: Event = {};
      event.transaction = '/cdf';
      return scope.applyToEvent(event).then(processedEvent => {
        expect(processedEvent!.transaction).toEqual('/abc');
      });
    });

    test('adds trace context', async () => {
      expect.assertions(1);
      const scope = new Scope();
      const span = {
        fake: 'span',
        getTraceContext: () => ({ a: 'b' }),
      } as any;
      scope.setSpan(span);
      const event: Event = {};
      return scope.applyToEvent(event).then(processedEvent => {
        expect((processedEvent!.contexts!.trace as any).a).toEqual('b');
      });
    });

    test('existing trace context in event should take precedence', async () => {
      expect.assertions(1);
      const scope = new Scope();
      const span = {
        fake: 'span',
        getTraceContext: () => ({ a: 'b' }),
      } as any;
      scope.setSpan(span);
      const event: Event = {
        contexts: {
          trace: { a: 'c' },
        },
      };
      return scope.applyToEvent(event).then(processedEvent => {
        expect((processedEvent!.contexts!.trace as any).a).toEqual('c');
      });
    });

    test('adds `transaction` tag when transaction on scope', async () => {
      expect.assertions(1);
      const scope = new Scope();
      const transaction = {
        fake: 'span',
        getTraceContext: () => ({ a: 'b' }),
        name: 'fake transaction',
      } as any;
      transaction.transaction = transaction; // because this is a transaction, its `transaction` pointer points to itself
      scope.setSpan(transaction);
      const event: Event = {};
      return scope.applyToEvent(event).then(processedEvent => {
        expect(processedEvent!.tags!.transaction).toEqual('fake transaction');
      });
    });

    test('adds `transaction` tag when span on scope', async () => {
      expect.assertions(1);
      const scope = new Scope();
      const transaction = { name: 'fake transaction' };
      const span = {
        fake: 'span',
        getTraceContext: () => ({ a: 'b' }),
        transaction,
      } as any;
      scope.setSpan(span);
      const event: Event = {};
      return scope.applyToEvent(event).then(processedEvent => {
        expect(processedEvent!.tags!.transaction).toEqual('fake transaction');
      });
    });
  });

  test('clear', () => {
    const scope = new Scope();
    scope.setExtra('a', 2);
    scope.setTag('a', 'b');
    scope.setUser({ id: '1' });
    scope.setFingerprint(['abcd']);
    scope.addBreadcrumb({ message: 'test' });
    scope.setRequestSession({ status: 'ok' });
    expect((scope as any)._extra).toEqual({ a: 2 });
    scope.clear();
    expect((scope as any)._extra).toEqual({});
    expect((scope as any)._requestSession).toEqual(undefined);
  });

  test('clearBreadcrumbs', () => {
    const scope = new Scope();
    scope.addBreadcrumb({ message: 'test' });
    expect((scope as any)._breadcrumbs).toHaveLength(1);
    scope.clearBreadcrumbs();
    expect((scope as any)._breadcrumbs).toHaveLength(0);
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
      // @ts-ignore we want to be able to update scope with string
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
    });
  });

  describe('addEventProcessor', () => {
    test('should allow for basic event manipulation', async () => {
      expect.assertions(3);
      const event: Event = {
        extra: { b: 3 },
      };
      const localScope = new Scope();
      localScope.setExtra('a', 'b');
      localScope.addEventProcessor((processedEvent: Event) => {
        expect(processedEvent.extra).toEqual({ a: 'b', b: 3 });
        return processedEvent;
      });
      localScope.addEventProcessor((processedEvent: Event) => {
        processedEvent.dist = '1';
        return processedEvent;
      });
      localScope.addEventProcessor((processedEvent: Event) => {
        expect(processedEvent.dist).toEqual('1');
        return processedEvent;
      });

      return localScope.applyToEvent(event).then(final => {
        expect(final!.dist).toEqual('1');
      });
    });

    test('should work alongside global event processors', async () => {
      expect.assertions(3);
      const event: Event = {
        extra: { b: 3 },
      };
      const localScope = new Scope();
      localScope.setExtra('a', 'b');

      addGlobalEventProcessor((processedEvent: Event) => {
        processedEvent.dist = '1';
        return processedEvent;
      });

      localScope.addEventProcessor((processedEvent: Event) => {
        expect(processedEvent.extra).toEqual({ a: 'b', b: 3 });
        return processedEvent;
      });

      localScope.addEventProcessor((processedEvent: Event) => {
        expect(processedEvent.dist).toEqual('1');
        return processedEvent;
      });

      return localScope.applyToEvent(event).then(final => {
        expect(final!.dist).toEqual('1');
      });
    });

    test('should allow for async callbacks', async () => {
      jest.useFakeTimers();
      expect.assertions(6);
      const event: Event = {
        extra: { b: 3 },
      };
      const localScope = new Scope();
      localScope.setExtra('a', 'b');
      const callCounter = jest.fn();
      localScope.addEventProcessor((processedEvent: Event) => {
        callCounter(1);
        expect(processedEvent.extra).toEqual({ a: 'b', b: 3 });
        return processedEvent;
      });
      localScope.addEventProcessor(
        async (processedEvent: Event) =>
          new Promise<Event>(resolve => {
            callCounter(2);
            setTimeout(() => {
              callCounter(3);
              processedEvent.dist = '1';
              resolve(processedEvent);
            }, 1);
            jest.runAllTimers();
          }),
      );
      localScope.addEventProcessor((processedEvent: Event) => {
        callCounter(4);
        return processedEvent;
      });

      return localScope.applyToEvent(event).then(processedEvent => {
        expect(callCounter.mock.calls[0][0]).toBe(1);
        expect(callCounter.mock.calls[1][0]).toBe(2);
        expect(callCounter.mock.calls[2][0]).toBe(3);
        expect(callCounter.mock.calls[3][0]).toBe(4);
        expect(processedEvent!.dist).toEqual('1');
      });
    });

    test('should correctly handle async rejections', async () => {
      jest.useFakeTimers();
      expect.assertions(2);
      const event: Event = {
        extra: { b: 3 },
      };
      const localScope = new Scope();
      localScope.setExtra('a', 'b');
      const callCounter = jest.fn();
      localScope.addEventProcessor((processedEvent: Event) => {
        callCounter(1);
        expect(processedEvent.extra).toEqual({ a: 'b', b: 3 });
        return processedEvent;
      });
      localScope.addEventProcessor(
        async (_processedEvent: Event) =>
          new Promise<Event>((_, reject) => {
            setTimeout(() => {
              reject('bla');
            }, 1);
            jest.runAllTimers();
          }),
      );
      localScope.addEventProcessor((processedEvent: Event) => {
        callCounter(4);
        return processedEvent;
      });

      return localScope.applyToEvent(event).then(null, reason => {
        expect(reason).toEqual('bla');
      });
    });

    test('should drop an event when any of processors return null', async () => {
      expect.assertions(1);
      const event: Event = {
        extra: { b: 3 },
      };
      const localScope = new Scope();
      localScope.setExtra('a', 'b');
      localScope.addEventProcessor(async (_: Event) => null);
      return localScope.applyToEvent(event).then(processedEvent => {
        expect(processedEvent).toBeNull();
      });
    });

    test('should have an access to the EventHint', async () => {
      expect.assertions(3);
      const event: Event = {
        extra: { b: 3 },
      };
      const localScope = new Scope();
      localScope.setExtra('a', 'b');
      localScope.addEventProcessor(async (internalEvent: Event, hint?: EventHint) => {
        expect(hint).toBeTruthy();
        expect(hint!.syntheticException).toBeTruthy();
        return internalEvent;
      });
      return localScope.applyToEvent(event, { syntheticException: new Error('what') }).then(processedEvent => {
        expect(processedEvent).toEqual(event);
      });
    });

    test('should notify all the listeners about the changes', () => {
      jest.useFakeTimers();
      const scope = new Scope();
      const listener = jest.fn();
      scope.addScopeListener(listener);
      scope.setExtra('a', 2);
      jest.runAllTimers();
      expect(listener).toHaveBeenCalled();
      expect(listener.mock.calls[0][0]._extra).toEqual({ a: 2 });
    });
  });
});
