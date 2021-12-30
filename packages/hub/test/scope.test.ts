import { Event, EventHint, Scope } from '@sentry/types';
import { getGlobalObject } from '@sentry/utils';

import { addGlobalEventProcessor, makeScope } from '../src';

describe('Scope', () => {
  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
    getGlobalObject<any>().__SENTRY__.globalEventProcessors = undefined;
  });

  describe('attributes modification', () => {
    test('setFingerprint', () => {
      const scope = makeScope();
      scope.setScopeData('fingerprint', ['abcd']);
      expect(scope.getScopeData('fingerprint')).toEqual(['abcd']);
    });

    test('addExtra', () => {
      const scope = makeScope();
      scope.addExtra('a', 1);
      expect(scope.getExtra('a')).toBe(1);
    });

    test('addExtras', () => {
      const scope = makeScope();
      scope.setScopeData('extras', { a: 1 });
      expect(scope.getScopeData('extras')).toEqual({ a: 1 });
    });

    test('addExtras with undefined overrides the value', () => {
      const scope = makeScope();
      scope.addExtra('a', 1);
      scope.setScopeData('extras', { a: undefined });
      expect(scope.getScopeData('extras')).toEqual({ a: undefined });
    });

    test('setTag', () => {
      const scope = makeScope();
      scope.addTag('a', 'b');
      expect(scope.getScopeData('tags')).toEqual({ a: 'b' });
    });

    test('setTags', () => {
      const scope = makeScope();
      scope.setScopeData('tags', { a: 'b' });
      expect(scope.getScopeData('tags')).toEqual({ a: 'b' });
    });

    test('setUser', () => {
      const scope = makeScope();
      scope.setScopeData('user', { id: '1' });
      expect(scope.getScopeData('user')).toEqual({ id: '1' });
    });

    test('setUser with null unsets the user', () => {
      const scope = makeScope();
      scope.setScopeData('user', { id: '1' });
      scope.setScopeData('user', null);
      expect(scope.getScopeData('user')).toEqual({});
    });

    test('addBreadcrumb', () => {
      const scope = makeScope();
      scope.addBreadcrumb({ message: 'test' });
      expect(scope.getScopeData('breadcrumbs')[0]).toHaveProperty('message', 'test');
    });

    test('addBreadcrumb can be limited to hold up to N breadcrumbs', () => {
      const scope = makeScope();
      for (let i = 0; i < 10; i++) {
        scope.addBreadcrumb({ message: 'test' }, 5);
      }
      expect(scope.getScopeData('breadcrumbs')).toHaveLength(5);
    });

    test('addBreadcrumb cannot go over MAX_BREADCRUMBS value', () => {
      const scope = makeScope();
      for (let i = 0; i < 111; i++) {
        scope.addBreadcrumb({ message: 'test' }, 111);
      }
      expect(scope.getScopeData('breadcrumbs')).toHaveLength(100);
    });

    test('setLevel', () => {
      const scope = makeScope();
      scope.setScopeData('level', 'critical');
      expect(scope.getScopeData('level')).toEqual('critical');
    });

    test('setTransactionName', () => {
      const scope = makeScope();
      scope.setScopeData('transactionName', '/abc');
      expect(scope.getScopeData('transactionName')).toEqual('/abc');
    });

    test('setTransactionName with no value unsets it', () => {
      const scope = makeScope();
      scope.setScopeData('transactionName', '/abc');
      scope.setScopeData('transactionName', undefined);
      expect(scope.getScopeData('transactionName')).toBeUndefined();
    });

    test('addContext', () => {
      const scope = makeScope();
      scope.addContext('os', { id: '1' });
      expect(scope.getScopeData('contexts')['os']).toEqual({ id: '1' });
    });

    test('addContext with null unsets it', () => {
      const scope = makeScope();
      scope.addContext('os', { id: '1' });
      scope.addContext('os', null);
      expect(scope.getScopeData('user')).toEqual({});
    });

    test('setSpan', () => {
      const scope = makeScope();
      const span = { fake: 'span' } as any;
      scope.setScopeData('span', span);
      expect(scope.getScopeData('span')).toEqual(span);
    });

    test('setSpan with no value unsets it', () => {
      const scope = makeScope();
      scope.setScopeData('span', { fake: 'span' } as any);
      scope.setScopeData('span', undefined);
      expect(scope.getScopeData('span')).toEqual(undefined);
    });

    test('chaining', () => {
      const scope = makeScope();
      scope.setScopeData('level', 'critical').setScopeData('user', { id: '1' });
      expect(scope.getScopeData('level')).toEqual('critical');
      expect(scope.getScopeData('user')).toEqual({ id: '1' });
    });
  });

  describe('clone', () => {
    test('basic inheritance', () => {
      const parentScope = makeScope();
      parentScope.addExtra('a', 1);
      const scope = parentScope.clone();
      expect(parentScope.getScopeData('extras')).toEqual(scope.getScopeData('extras'));
    });

    test('_requestSession clone', () => {
      const parentScope = makeScope();
      parentScope.setScopeData('requestSession', { status: 'errored' });
      const scope = parentScope.clone();
      expect(parentScope.getScopeData('requestSession')).toEqual(scope.getScopeData('requestSession'));
    });

    test('parent changed inheritance', () => {
      const parentScope = makeScope();
      const scope = parentScope.clone();
      parentScope.addExtra('a', 2);
      expect(scope.getScopeData('extras')).toEqual({});
      expect(parentScope.getScopeData('extras')).toEqual({ a: 2 });
    });

    test('child override inheritance', () => {
      const parentScope = makeScope();
      parentScope.addExtra('a', 1);

      const scope = parentScope.clone();
      scope.addExtra('a', 2);
      expect(parentScope.getScopeData('extras')).toEqual({ a: 1 });
      expect(scope.getScopeData('extras')).toEqual({ a: 2 });
    });

    test('child override should set the value of parent _requestSession', () => {
      // Test that ensures if the status value of `status` of `_requestSession` is changed in a child scope
      // that it should also change in parent scope because we are copying the reference to the object
      const parentScope = makeScope();
      parentScope.setScopeData('requestSession', { status: 'errored' });

      const scope = parentScope.clone();
      const requestSession = scope.getScopeData('requestSession');
      if (requestSession) {
        requestSession.status = 'ok';
      }

      expect(parentScope.getScopeData('requestSession')).toEqual({ status: 'ok' });
      expect(scope.getScopeData('requestSession')).toEqual({ status: 'ok' });
    });
  });

  describe('applyToEvent', () => {
    test('basic usage', () => {
      expect.assertions(8);
      const scope = makeScope();
      scope.addExtra('a', 2);
      scope.addTag('a', 'b');
      scope.setScopeData('user', { id: '1' });
      scope.setScopeData('fingerprint', ['abcd']);
      scope.setScopeData('level', 'warning');
      scope.setScopeData('transactionName', '/abc');
      scope.addBreadcrumb({ message: 'test' });
      scope.addContext('os', { id: '1' });
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
      });
    });

    test('merge with existing event data', () => {
      expect.assertions(8);
      const scope = makeScope();
      scope.addExtra('a', 2);
      scope.addTag('a', 'b');
      scope.setScopeData('user', { id: '1' });
      scope.setScopeData('fingerprint', ['abcd']);
      scope.addBreadcrumb({ message: 'test' });
      scope.addContext('server', { id: '2' });
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
      const scope = makeScope();
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
      const scope = makeScope();
      scope.setScopeData('fingerprint', ['foo']);
      const event: Event = {
        fingerprint: ['bar'],
      };

      await scope.applyToEvent(event).then(processedEvent => {
        expect(processedEvent!.fingerprint).toEqual(['bar', 'foo']);
      });
    });

    test('should remove default empty fingerprint array if theres no data available', async () => {
      const scope = makeScope();
      const event: Event = {};
      await scope.applyToEvent(event).then(processedEvent => {
        expect(processedEvent!.fingerprint).toEqual(undefined);
      });
    });

    test('scope level should have priority over event level', () => {
      expect.assertions(1);
      const scope = makeScope();
      scope.setScopeData('level', 'warning');
      const event: Event = {};
      event.level = 'critical';
      return scope.applyToEvent(event).then(processedEvent => {
        expect(processedEvent!.level).toEqual('warning');
      });
    });

    test('scope transaction should have priority over event transaction', () => {
      expect.assertions(1);
      const scope = makeScope();
      scope.setScopeData('transactionName', '/abc');
      const event: Event = {};
      event.transaction = '/cdf';
      return scope.applyToEvent(event).then(processedEvent => {
        expect(processedEvent!.transaction).toEqual('/abc');
      });
    });
  });

  test('applyToEvent trace context', async () => {
    expect.assertions(1);
    const scope = makeScope();
    const span = {
      fake: 'span',
      getTraceContext: () => ({ a: 'b' }),
    } as any;
    scope.setScopeData('span', span);
    const event: Event = {};
    return scope.applyToEvent(event).then(processedEvent => {
      expect((processedEvent!.contexts!.trace as any).a).toEqual('b');
    });
  });

  test('applyToEvent existing trace context in event should be stronger', async () => {
    expect.assertions(1);
    const scope = makeScope();
    const span = {
      fake: 'span',
      getTraceContext: () => ({ a: 'b' }),
    } as any;
    scope.setScopeData('span', span);
    const event: Event = {
      contexts: {
        trace: { a: 'c' },
      },
    };
    return scope.applyToEvent(event).then(processedEvent => {
      expect((processedEvent!.contexts!.trace as any).a).toEqual('c');
    });
  });

  test('applyToEvent transaction name tag when transaction on scope', async () => {
    expect.assertions(1);
    const scope = makeScope();
    const transaction = {
      fake: 'span',
      getTraceContext: () => ({ a: 'b' }),
      name: 'fake transaction',
    } as any;
    transaction.transaction = transaction; // because this is a transaction, its transaction pointer points to itself
    scope.setScopeData('span', transaction);
    const event: Event = {};
    return scope.applyToEvent(event).then(processedEvent => {
      expect(processedEvent!.tags!.transaction).toEqual('fake transaction');
    });
  });

  test('applyToEvent transaction name tag when span on scope', async () => {
    expect.assertions(1);
    const scope = makeScope();
    const transaction = { name: 'fake transaction' };
    const span = {
      fake: 'span',
      getTraceContext: () => ({ a: 'b' }),
      transaction,
    } as any;
    scope.setScopeData('span', span);
    const event: Event = {};
    return scope.applyToEvent(event).then(processedEvent => {
      expect(processedEvent!.tags!.transaction).toEqual('fake transaction');
    });
  });

  test('clear', () => {
    const scope = makeScope();
    scope.addExtra('a', 2);
    scope.addTag('a', 'b');
    scope.setScopeData('user', { id: '1' });
    scope.setScopeData('fingerprint', ['abcd']);
    scope.addBreadcrumb({ message: 'test' });
    scope.setScopeData('requestSession', { status: 'ok' });
    expect(scope.getScopeData('extras')).toEqual({ a: 2 });
    scope.clear();
    expect(scope.getScopeData('extras')).toEqual({});
    expect(scope.getScopeData('requestSession')).toEqual(undefined);
  });

  test('clearBreadcrumbs', () => {
    const scope = makeScope();
    scope.addBreadcrumb({ message: 'test' });
    expect(scope.getScopeData('breadcrumbs')).toHaveLength(1);
    scope.clearBreadcrumbs();
    expect(scope.getScopeData('breadcrumbs')).toHaveLength(0);
  });

  describe('update', () => {
    let scope: Scope;

    beforeEach(() => {
      scope = makeScope();
      scope.setScopeData('tags', { foo: '1', bar: '2' });
      scope.setScopeData('extras', { foo: '1', bar: '2' });
      scope.addContext('foo', { id: '1' });
      scope.addContext('bar', { id: '2' });
      scope.setScopeData('user', { id: '1337' });
      scope.setScopeData('level', 'info');
      scope.setScopeData('fingerprint', ['foo']);
      scope.setScopeData('requestSession', { status: 'ok' });
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
      const localScope = makeScope();
      localScope.setScopeData('tags', { bar: '3', baz: '4' });
      localScope.setScopeData('extras', { bar: '3', baz: '4' });
      localScope.addContext('bar', { id: '3' });
      localScope.addContext('baz', { id: '4' });
      localScope.setScopeData('user', { id: '42' });
      localScope.setScopeData('level', 'warning');
      localScope.setScopeData('fingerprint', ['bar']);
      localScope.setScopeData('requestSession', { status: 'ok' });

      const updatedScope = scope.update(localScope);

      expect(updatedScope.getScopeData('tags')).toEqual({
        bar: '3',
        baz: '4',
        foo: '1',
      });
      expect(updatedScope.getScopeData('extras')).toEqual({
        bar: '3',
        baz: '4',
        foo: '1',
      });
      expect(updatedScope.getScopeData('contexts')).toEqual({
        bar: { id: '3' },
        baz: { id: '4' },
        foo: { id: '1' },
      });
      expect(updatedScope.getScopeData('user')).toEqual({ id: '42' });
      expect(updatedScope.getScopeData('level')).toEqual('warning');
      expect(updatedScope.getScopeData('fingerprint')).toEqual(['bar']);
      expect(updatedScope.getScopeData('requestSession').status).toEqual('ok');
    });

    test.only('given an empty instance of Scope, it should preserve all the original scope data', () => {
      const updatedScope = scope.update(makeScope());

      console.log(scope.getScopeData('user'));
      expect(updatedScope.getScopeData('tags')).toEqual({
        bar: '2',
        foo: '1',
      });
      expect(updatedScope.getScopeData('extras')).toEqual({
        bar: '2',
        foo: '1',
      });
      expect(updatedScope.getScopeData('contexts')).toEqual({
        bar: { id: '2' },
        foo: { id: '1' },
      });
      expect(updatedScope.getScopeData('user')).toEqual({ id: '1337' });
      expect(updatedScope.getScopeData('level')).toEqual('info');
      expect(updatedScope.getScopeData('fingerprint')).toEqual(['foo']);
      expect(updatedScope.getScopeData('requestSession').status).toEqual('ok');
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
      const updatedScope = scope.update(localAttributes);

      expect(updatedScope.getScopeData('tags')).toEqual({
        bar: '3',
        baz: '4',
        foo: '1',
      });
      expect(updatedScope.getScopeData('extras')).toEqual({
        bar: '3',
        baz: '4',
        foo: '1',
      });
      expect(updatedScope.getScopeData('contexts')).toEqual({
        bar: { id: '3' },
        baz: { id: '4' },
        foo: { id: '1' },
      });
      expect(updatedScope.getScopeData('user')).toEqual({ id: '42' });
      expect(updatedScope.getScopeData('level')).toEqual('warning');
      expect(updatedScope.getScopeData('fingerprint')).toEqual(['bar']);
      expect(updatedScope.getScopeData('requestSession')).toEqual({ status: 'errored' });
    });
  });

  describe('addEventProcessor', () => {
    test('should allow for basic event manipulation', () => {
      expect.assertions(3);
      const event: Event = {
        extra: { b: 3 },
      };
      const localScope = makeScope();
      localScope.addExtra('a', 'b');
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

    test('should work alongside global event processors', () => {
      expect.assertions(3);
      const event: Event = {
        extra: { b: 3 },
      };
      const localScope = makeScope();
      localScope.addExtra('a', 'b');

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
      const localScope = makeScope();
      localScope.addExtra('a', 'b');
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
      const localScope = makeScope();
      localScope.addExtra('a', 'b');
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

    test('should drop an event when any of processors return null', () => {
      expect.assertions(1);
      const event: Event = {
        extra: { b: 3 },
      };
      const localScope = makeScope();
      localScope.addExtra('a', 'b');
      localScope.addEventProcessor(async (_: Event) => null);
      return localScope.applyToEvent(event).then(processedEvent => {
        expect(processedEvent).toBeNull();
      });
    });

    test('should have an access to the EventHint', () => {
      expect.assertions(3);
      const event: Event = {
        extra: { b: 3 },
      };
      const localScope = makeScope();
      localScope.addExtra('a', 'b');
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
      const scope = makeScope();
      const listener = jest.fn();
      scope.addScopeListener(listener);
      scope.addExtra('a', 2);
      jest.runAllTimers();
      expect(listener).toHaveBeenCalled();
      expect(listener.mock.calls[0][0].getScopeData('extras')).toEqual({ a: 2 });
    });
  });
});
