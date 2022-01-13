import { Event, EventHint } from '@sentry/types';
import { getGlobalObject } from '@sentry/utils';

import {
  addGlobalEventProcessor,
  applyScopeToEvent,
  cloneScope,
  getScopeSession,
  Scope,
  Session,
  updateScope,
} from '../src';
import {
  addScopeBreadcrumb,
  addScopeEventProcessor,
  addScopeListener,
  clearScope,
  clearScopeBreadcrumbs,
  getScopeRequestSession,
  setScopeContext,
  setScopeExtra,
  setScopeExtras,
  setScopeFingerprint,
  setScopeLevel,
  setScopeRequestSession,
  setScopeSession,
  setScopeSpan,
  setScopeTag,
  setScopeTags,
  setScopeTransactionName,
  setScopeUser,
} from '../src/scope';

describe('Scope', () => {
  afterEach(() => {
    jest.resetAllMocks();
    getGlobalObject<any>().__SENTRY__.globalEventProcessors = undefined;
  });

  describe('setScopeSession', () => {
    test('given an session then set the session to the scope', () => {
      // GIVEN
      const session = new Session();
      const scope = new Scope();
      // WHEN
      setScopeSession(scope, session);
      // THEN
      expect(getScopeSession(scope)).toEqual(session);
    });
    test('given an undefined or null session then removes the existing session', () => {
      // GIVEN
      const session = new Session();
      const scope = new Scope();
      setScopeSession(scope, session);
      // WHEN
      setScopeSession(scope, undefined);
      // THEN
      expect(getScopeSession(scope)).toBeUndefined();
    });
  });

  describe('attributes modification', () => {
    test('setFingerprint', () => {
      const scope = new Scope();
      setScopeFingerprint(scope, ['abcd']);
      expect(scope.fingerprint).toEqual(['abcd']);
    });

    test('setExtra', () => {
      const scope = new Scope();
      setScopeExtra(scope, 'a', 1);
      expect(scope.extra).toEqual({ a: 1 });
    });

    test('setExtras', () => {
      const scope = new Scope();
      setScopeExtras(scope, { a: 1 });
      expect(scope.extra).toEqual({ a: 1 });
    });

    test('setExtras with undefined overrides the value', () => {
      const scope = new Scope();
      setScopeExtra(scope, 'a', 1);
      setScopeExtras(scope, { a: undefined });
      expect(scope.extra).toEqual({ a: undefined });
    });

    test('setTag', () => {
      const scope = new Scope();
      setScopeTag(scope, 'a', 'b');
      expect(scope.tags).toEqual({ a: 'b' });
    });

    test('setTags', () => {
      const scope = new Scope();
      setScopeTags(scope, { a: 'b' });
      expect(scope.tags).toEqual({ a: 'b' });
    });

    test('setUser', () => {
      const scope = new Scope();
      setScopeUser(scope, { id: '1' });
      expect(scope.user).toEqual({ id: '1' });
    });

    test('setUser with null unsets the user', () => {
      const scope = new Scope();
      setScopeUser(scope, { id: '1' });
      setScopeUser(scope, null);
      expect(scope.user).toEqual({});
    });

    test('addBreadcrumb', () => {
      const scope = new Scope();
      addScopeBreadcrumb(scope, { message: 'test' });
      expect(scope.breadcrumbs[0]).toHaveProperty('message', 'test');
    });

    test('addBreadcrumb can be limited to hold up to N breadcrumbs', () => {
      const scope = new Scope();
      for (let i = 0; i < 10; i++) {
        addScopeBreadcrumb(scope, { message: 'test' }, 5);
      }
      expect(scope.breadcrumbs).toHaveLength(5);
    });

    test('addBreadcrumb cannot go over MAX_BREADCRUMBS value', () => {
      const scope = new Scope();
      for (let i = 0; i < 111; i++) {
        addScopeBreadcrumb(scope, { message: 'test' }, 111);
      }
      expect(scope.breadcrumbs).toHaveLength(100);
    });

    test('setLevel', () => {
      const scope = new Scope();
      setScopeLevel(scope, 'critical');
      expect(scope.level).toEqual('critical');
    });

    test('setTransactionName', () => {
      const scope = new Scope();
      setScopeTransactionName(scope, '/abc');
      expect(scope.transactionName).toEqual('/abc');
    });

    test('setTransactionName with no value unsets it', () => {
      const scope = new Scope();
      setScopeTransactionName(scope, '/abc');
      setScopeTransactionName(scope);
      expect(scope.transactionName).toBeUndefined();
    });

    test('setContext', () => {
      const scope = new Scope();
      setScopeContext(scope, 'os', { id: '1' });
      expect(scope.contexts.os).toEqual({ id: '1' });
    });

    test('setContext with null unsets it', () => {
      const scope = new Scope();
      setScopeContext(scope, 'os', { id: '1' });
      setScopeContext(scope, 'os', null);
      expect(scope.user).toEqual({});
    });

    test('setSpan', () => {
      const scope = new Scope();
      const span = { fake: 'span' } as any;
      setScopeSpan(scope, span);
      expect(scope.span).toEqual(span);
    });

    test('setSpan with no value unsets it', () => {
      const scope = new Scope();
      const span = { fake: 'span' } as any;
      setScopeSpan(scope, span);
      setScopeSpan(scope);
      expect(scope.span).toEqual(undefined);
    });

    test('chaining', () => {
      const scope = new Scope();
      setScopeLevel(scope, 'critical');
      setScopeUser(scope, { id: '1' });
      expect(scope.level).toEqual('critical');
      expect(scope.user).toEqual({ id: '1' });
    });
  });

  describe('clone', () => {
    test('basic inheritance', () => {
      const parentScope = new Scope();
      setScopeExtra(parentScope, 'a', 1);
      const scope = cloneScope(parentScope);
      expect(parentScope.extra).toEqual(scope.extra);
    });

    test('_requestSession clone', () => {
      const parentScope = new Scope();
      setScopeRequestSession(parentScope, { status: 'errored' });
      const scope = cloneScope(parentScope);
      expect(getScopeRequestSession(parentScope)).toEqual(getScopeRequestSession(scope));
    });

    test('parent changed inheritance', () => {
      const parentScope = new Scope();
      const scope = cloneScope(parentScope);
      setScopeExtra(parentScope, 'a', 2);
      expect(scope.extra).toEqual({});
      expect(parentScope.extra).toEqual({ a: 2 });
    });

    test('child override inheritance', () => {
      const parentScope = new Scope();
      setScopeExtra(parentScope, 'a', 1);

      const scope = cloneScope(parentScope);
      setScopeExtra(scope, 'a', 2);
      expect(parentScope.extra).toEqual({ a: 1 });
      expect(scope.extra).toEqual({ a: 2 });
    });

    test('child override should set the value of parent _requestSession', () => {
      // Test that ensures if the status value of `status` of `_requestSession` is changed in a child scope
      // that it should also change in parent scope because we are copying the reference to the object
      const parentScope = new Scope();
      setScopeRequestSession(parentScope, { status: 'errored' });

      const scope = cloneScope(parentScope);
      const requestSession = getScopeRequestSession(scope);
      if (requestSession) {
        requestSession.status = 'ok';
      }

      expect(getScopeRequestSession(parentScope)).toEqual({ status: 'ok' });
      expect(getScopeRequestSession(scope)).toEqual({ status: 'ok' });
    });
  });

  describe('applyToEvent', () => {
    test('basic usage', () => {
      expect.assertions(8);
      const scope = new Scope();

      setScopeExtra(scope, 'a', 2);
      setScopeTag(scope, 'a', 'b');
      setScopeUser(scope, { id: '1' });
      setScopeFingerprint(scope, ['abcd']);
      setScopeLevel(scope, 'warning');
      setScopeTransactionName(scope, '/abc');
      addScopeBreadcrumb(scope, { message: 'test' });
      setScopeContext(scope, 'os', { id: '1' });
      const event: Event = {};
      return applyScopeToEvent(scope, event).then(processedEvent => {
        expect(processedEvent!.extra).toEqual({ a: 2 });
        expect(processedEvent!.tags).toEqual({ a: 'b' });
        expect(processedEvent!.user).toEqual({ id: '1' });
        expect(processedEvent!.fingerprint).toEqual(['abcd']);
        expect(processedEvent!.level).toEqual('warning');
        expect(processedEvent!.transaction).toEqual('/abc');
        expect(processedEvent!.breadcrumbs![0]).toHaveProperty('message', 'test');
        expect(processedEvent!.contexts).toEqual({ os: { id: '1' } });
      });
    });

    test('merge with existing event data', () => {
      expect.assertions(8);
      const scope = new Scope();
      setScopeExtra(scope, 'a', 2);
      setScopeTag(scope, 'a', 'b');
      setScopeUser(scope, { id: '1' });
      setScopeFingerprint(scope, ['abcd']);
      addScopeBreadcrumb(scope, { message: 'test' });
      setScopeContext(scope, 'server', { id: '2' });
      const event: Event = {
        breadcrumbs: [{ message: 'test1' }],
        contexts: { os: { id: '1' } },
        extra: { b: 3 },
        fingerprint: ['efgh'],
        tags: { b: 'c' },
        user: { id: '3' },
      };
      return applyScopeToEvent(scope, event).then(processedEvent => {
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
      await applyScopeToEvent(scope, event).then(processedEvent => {
        expect(processedEvent!.fingerprint).toEqual(['foo']);
      });

      // @ts-ignore we want to be able to assign string value
      event.fingerprint = 'bar';
      await applyScopeToEvent(scope, event).then(processedEvent => {
        expect(processedEvent!.fingerprint).toEqual(['bar']);
      });
    });

    test('should merge fingerprint from event and scope', async () => {
      const scope = new Scope();
      setScopeFingerprint(scope, ['foo']);
      const event: Event = {
        fingerprint: ['bar'],
      };

      await applyScopeToEvent(scope, event).then(processedEvent => {
        expect(processedEvent!.fingerprint).toEqual(['bar', 'foo']);
      });
    });

    test('should remove default empty fingerprint array if theres no data available', async () => {
      const scope = new Scope();
      const event: Event = {};
      await applyScopeToEvent(scope, event).then(processedEvent => {
        expect(processedEvent!.fingerprint).toEqual(undefined);
      });
    });

    test('scope level should have priority over event level', () => {
      expect.assertions(1);
      const scope = new Scope();
      setScopeLevel(scope, 'warning');
      const event: Event = {};
      event.level = 'critical';
      return applyScopeToEvent(scope, event).then(processedEvent => {
        expect(processedEvent!.level).toEqual('warning');
      });
    });

    test('scope transaction should have priority over event transaction', () => {
      expect.assertions(1);
      const scope = new Scope();
      setScopeTransactionName(scope, '/abc');
      const event: Event = {};
      event.transaction = '/cdf';
      return applyScopeToEvent(scope, event).then(processedEvent => {
        expect(processedEvent!.transaction).toEqual('/abc');
      });
    });
  });

  test('applyToEvent trace context', async () => {
    expect.assertions(1);
    const scope = new Scope();
    const span = {
      fake: 'span',
      getTraceContext: () => ({ a: 'b' }),
    } as any;
    setScopeSpan(scope, span);
    const event: Event = {};
    return applyScopeToEvent(scope, event).then(processedEvent => {
      expect(processedEvent!.contexts!.trace.a).toEqual('b');
    });
  });

  test('applyToEvent existing trace context in event should be stronger', async () => {
    expect.assertions(1);
    const scope = new Scope();
    const span = {
      fake: 'span',
      getTraceContext: () => ({ a: 'b' }),
    } as any;
    setScopeSpan(scope, span);
    const event: Event = {
      contexts: {
        trace: { a: 'c' },
      },
    };
    return applyScopeToEvent(scope, event).then(processedEvent => {
      expect(processedEvent!.contexts!.trace.a).toEqual('c');
    });
  });

  test('applyToEvent transaction name tag when transaction on scope', async () => {
    expect.assertions(1);
    const scope = new Scope();
    const transaction = {
      fake: 'span',
      getTraceContext: () => ({ a: 'b' }),
      name: 'fake transaction',
    } as any;
    transaction.transaction = transaction; // because this is a transaction, its transaction pointer points to itself
    setScopeSpan(scope, transaction);
    const event: Event = {};
    return applyScopeToEvent(scope, event).then(processedEvent => {
      expect(processedEvent!.tags!.transaction).toEqual('fake transaction');
    });
  });

  test('applyToEvent transaction name tag when span on scope', async () => {
    expect.assertions(1);
    const scope = new Scope();
    const transaction = { name: 'fake transaction' };
    const span = {
      fake: 'span',
      getTraceContext: () => ({ a: 'b' }),
      transaction,
    } as any;
    setScopeSpan(scope, span);
    const event: Event = {};
    return applyScopeToEvent(scope, event).then(processedEvent => {
      expect(processedEvent!.tags!.transaction).toEqual('fake transaction');
    });
  });

  test('clear', () => {
    const scope = new Scope();
    setScopeExtra(scope, 'a', 2);
    setScopeTag(scope, 'a', 'b');
    setScopeUser(scope, { id: '1' });
    setScopeFingerprint(scope, ['abcd']);
    addScopeBreadcrumb(scope, { message: 'test' });
    setScopeRequestSession(scope, { status: 'ok' });
    expect(scope.extra).toEqual({ a: 2 });
    clearScope(scope);
    expect(scope.extra).toEqual({});
    expect(scope.requestSession).toEqual(undefined);
  });

  test('clearBreadcrumbs', () => {
    const scope = new Scope();
    addScopeBreadcrumb(scope, { message: 'test' });
    expect(scope.breadcrumbs).toHaveLength(1);
    clearScopeBreadcrumbs(scope);
    expect(scope.breadcrumbs).toHaveLength(0);
  });

  describe('update', () => {
    let scope: Scope;

    beforeEach(() => {
      scope = new Scope();
      setScopeTags(scope, { foo: '1', bar: '2' });
      setScopeExtras(scope, { foo: '1', bar: '2' });
      setScopeContext(scope, 'foo', { id: '1' });
      setScopeContext(scope, 'bar', { id: '2' });
      setScopeUser(scope, { id: '1337' });
      setScopeLevel(scope, 'info');
      setScopeFingerprint(scope, ['foo']);
      setScopeRequestSession(scope, { status: 'ok' });
    });

    test('given no data, returns the original scope', () => {
      const updatedScope = updateScope(scope);
      expect(updatedScope).toEqual(scope);
    });

    test('given neither function, Scope or plain object, returns original scope', () => {
      // @ts-ignore we want to be able to update scope with string
      const updatedScope = updateScope(scope, 'wat');
      expect(updatedScope).toEqual(scope);
    });

    test('given callback function, pass it the scope and returns original or modified scope', () => {
      const cb = jest
        .fn()
        .mockImplementationOnce(v => v)
        .mockImplementationOnce(v => {
          setScopeTag(v, 'foo', 'bar');
          return v;
        });

      let updatedScope = updateScope(scope, cb);
      expect(cb).toHaveBeenNthCalledWith(1, scope);
      expect(updatedScope).toEqual(scope);

      updatedScope = updateScope(scope, cb);
      expect(cb).toHaveBeenNthCalledWith(2, scope);
      expect(updatedScope).toEqual(scope);
    });

    test('given callback function, when it doesnt return instanceof Scope, ignore it and return original scope', () => {
      const cb = jest.fn().mockImplementationOnce(_v => 'wat');
      const updatedScope = updateScope(scope, cb);
      expect(cb).toHaveBeenCalledWith(scope);
      expect(updatedScope).toEqual(scope);
    });

    test('given another instance of Scope, it should merge two together, with the passed scope having priority', () => {
      const localScope = new Scope();
      setScopeTags(localScope, { bar: '3', baz: '4' });
      setScopeExtras(localScope, { bar: '3', baz: '4' });
      setScopeContext(localScope, 'bar', { id: '3' });
      setScopeContext(localScope, 'baz', { id: '4' });
      setScopeUser(localScope, { id: '42' });
      setScopeLevel(localScope, 'warning');
      setScopeFingerprint(localScope, ['bar']);
      localScope.requestSession = { status: 'ok' };

      const updatedScope = updateScope(scope, localScope);

      expect(updatedScope.tags).toEqual({
        bar: '3',
        baz: '4',
        foo: '1',
      });
      expect(updatedScope.extra).toEqual({
        bar: '3',
        baz: '4',
        foo: '1',
      });
      expect(updatedScope.contexts).toEqual({
        bar: { id: '3' },
        baz: { id: '4' },
        foo: { id: '1' },
      });
      expect(updatedScope.user).toEqual({ id: '42' });
      expect(updatedScope.level).toEqual('warning');
      expect(updatedScope.fingerprint).toEqual(['bar']);
      expect(updatedScope.requestSession?.status).toEqual('ok');
    });

    test('given an empty instance of Scope, it should preserve all the original scope data', () => {
      const updatedScope = updateScope(scope, new Scope());

      expect(updatedScope.tags).toEqual({
        bar: '2',
        foo: '1',
      });
      expect(updatedScope.extra).toEqual({
        bar: '2',
        foo: '1',
      });
      expect(updatedScope.contexts).toEqual({
        bar: { id: '2' },
        foo: { id: '1' },
      });
      expect(updatedScope.user).toEqual({ id: '1337' });
      expect(updatedScope.level).toEqual('info');
      expect(updatedScope.fingerprint).toEqual(['foo']);
      expect(updatedScope.requestSession?.status).toEqual('ok');
    });

    test('given a plain object, it should merge two together, with the passed object having priority', () => {
      const localAttributes = {
        contexts: { bar: { id: '3' }, baz: { id: '4' } },
        extra: { bar: '3', baz: '4' },
        fingerprint: ['bar'],
        level: 'warning',
        tags: { bar: '3', baz: '4' },
        user: { id: '42' },
        requestSession: { status: 'errored' },
      };
      const updatedScope = updateScope(scope, localAttributes);

      expect(updatedScope.tags).toEqual({
        bar: '3',
        baz: '4',
        foo: '1',
      });
      expect(updatedScope.extra).toEqual({
        bar: '3',
        baz: '4',
        foo: '1',
      });
      expect(updatedScope.contexts).toEqual({
        bar: { id: '3' },
        baz: { id: '4' },
        foo: { id: '1' },
      });
      expect(updatedScope.user).toEqual({ id: '42' });
      expect(updatedScope.level).toEqual('warning');
      expect(updatedScope.fingerprint).toEqual(['bar']);
      expect(updatedScope.requestSession).toEqual({ status: 'errored' });
    });
  });

  describe('addEventProcessor', () => {
    test('should allow for basic event manipulation', () => {
      expect.assertions(3);
      const event: Event = {
        extra: { b: 3 },
      };
      const localScope = new Scope();
      setScopeExtra(localScope, 'a', 'b');
      addScopeEventProcessor(localScope, (processedEvent: Event) => {
        expect(processedEvent.extra).toEqual({ a: 'b', b: 3 });
        return processedEvent;
      });
      addScopeEventProcessor(localScope, (processedEvent: Event) => {
        processedEvent.dist = '1';
        return processedEvent;
      });
      addScopeEventProcessor(localScope, (processedEvent: Event) => {
        expect(processedEvent.dist).toEqual('1');
        return processedEvent;
      });

      return applyScopeToEvent(localScope, event).then(final => {
        expect(final!.dist).toEqual('1');
      });
    });

    test('should work alongside global event processors', () => {
      expect.assertions(3);
      const event: Event = {
        extra: { b: 3 },
      };
      const localScope = new Scope();
      setScopeExtra(localScope, 'a', 'b');

      addGlobalEventProcessor((processedEvent: Event) => {
        processedEvent.dist = '1';
        return processedEvent;
      });

      addScopeEventProcessor(localScope, (processedEvent: Event) => {
        expect(processedEvent.extra).toEqual({ a: 'b', b: 3 });
        return processedEvent;
      });

      addScopeEventProcessor(localScope, (processedEvent: Event) => {
        expect(processedEvent.dist).toEqual('1');
        return processedEvent;
      });

      return applyScopeToEvent(localScope, event).then(final => {
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
      setScopeExtra(localScope, 'a', 'b');
      const callCounter = jest.fn();
      addScopeEventProcessor(localScope, (processedEvent: Event) => {
        callCounter(1);
        expect(processedEvent.extra).toEqual({ a: 'b', b: 3 });
        return processedEvent;
      });
      addScopeEventProcessor(
        localScope,
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
      addScopeEventProcessor(localScope, (processedEvent: Event) => {
        callCounter(4);
        return processedEvent;
      });

      return applyScopeToEvent(localScope, event).then(processedEvent => {
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
      setScopeExtra(localScope, 'a', 'b');
      const callCounter = jest.fn();
      addScopeEventProcessor(localScope, (processedEvent: Event) => {
        callCounter(1);
        expect(processedEvent.extra).toEqual({ a: 'b', b: 3 });
        return processedEvent;
      });
      addScopeEventProcessor(
        localScope,
        async (_processedEvent: Event) =>
          new Promise<Event>((_, reject) => {
            setTimeout(() => {
              reject('bla');
            }, 1);
            jest.runAllTimers();
          }),
      );
      addScopeEventProcessor(localScope, (processedEvent: Event) => {
        callCounter(4);
        return processedEvent;
      });

      return applyScopeToEvent(localScope, event).then(null, reason => {
        expect(reason).toEqual('bla');
      });
    });

    test('should drop an event when any of processors return null', () => {
      expect.assertions(1);
      const event: Event = {
        extra: { b: 3 },
      };
      const localScope = new Scope();
      setScopeExtra(localScope, 'a', 'b');
      addScopeEventProcessor(localScope, async (_: Event) => null);
      return applyScopeToEvent(localScope, event).then(processedEvent => {
        expect(processedEvent).toBeNull();
      });
    });

    test('should have an access to the EventHint', () => {
      expect.assertions(3);
      const event: Event = {
        extra: { b: 3 },
      };
      const localScope = new Scope();
      setScopeExtra(localScope, 'a', 'b');
      addScopeEventProcessor(localScope, async (internalEvent: Event, hint?: EventHint) => {
        expect(hint).toBeTruthy();
        expect(hint!.syntheticException).toBeTruthy();
        return internalEvent;
      });
      return applyScopeToEvent(localScope, event, { syntheticException: new Error('what') }).then(processedEvent => {
        expect(processedEvent).toEqual(event);
      });
    });

    test('should notify all the listeners about the changes', () => {
      jest.useFakeTimers();
      const scope = new Scope();
      const listener = jest.fn();
      addScopeListener(scope, listener);
      setScopeExtra(scope, 'a', 2);
      jest.runAllTimers();
      expect(listener).toHaveBeenCalled();
      expect(listener.mock.calls[0][0].extra).toEqual({ a: 2 });
    });
  });
});
