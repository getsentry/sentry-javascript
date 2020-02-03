import { Event, EventHint, Severity } from '@sentry/types';
import { getGlobalObject } from '@sentry/utils';

import { addGlobalEventProcessor, Scope } from '../src';

describe('Scope', () => {
  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
    getGlobalObject<any>().__SENTRY__.globalEventProcessors = undefined;
  });

  describe('fingerprint', () => {
    test('set', () => {
      const scope = new Scope();
      scope.setFingerprint(['abcd']);
      expect((scope as any)._fingerprint).toEqual(['abcd']);
    });
  });

  describe('extra', () => {
    test('set key value', () => {
      const scope = new Scope();
      scope.setExtra('a', 1);
      expect((scope as any)._extra).toEqual({ a: 1 });
    });

    test('set object', () => {
      const scope = new Scope();
      scope.setExtras({ a: 1 });
      expect((scope as any)._extra).toEqual({ a: 1 });
    });

    test('set undefined', () => {
      const scope = new Scope();
      scope.setExtra('a', 1);
      scope.setExtras({ a: undefined });
      expect((scope as any)._extra).toEqual({ a: undefined });
    });
  });

  describe('tags', () => {
    test('set key value', () => {
      const scope = new Scope();
      scope.setTag('a', 'b');
      expect((scope as any)._tags).toEqual({ a: 'b' });
    });

    test('set object', () => {
      const scope = new Scope();
      scope.setTags({ a: 'b' });
      expect((scope as any)._tags).toEqual({ a: 'b' });
    });
  });

  describe('user', () => {
    test('set', () => {
      const scope = new Scope();
      scope.setUser({ id: '1' });
      expect((scope as any)._user).toEqual({ id: '1' });
    });
    test('unset', () => {
      const scope = new Scope();
      scope.setUser({ id: '1' });
      scope.setUser(null);
      expect((scope as any)._user).toEqual({});
    });
  });

  describe('level', () => {
    test('add', () => {
      const scope = new Scope();
      scope.addBreadcrumb({ message: 'test' }, 100);
      expect((scope as any)._breadcrumbs[0]).toHaveProperty('message', 'test');
    });
    test('set', () => {
      const scope = new Scope();
      scope.setLevel(Severity.Critical);
      expect((scope as any)._level).toEqual(Severity.Critical);
    });
  });

  describe('transaction', () => {
    test('set', () => {
      const scope = new Scope();
      scope.setTransaction('/abc');
      expect((scope as any)._transaction).toEqual('/abc');
    });
    test('unset', () => {
      const scope = new Scope();
      scope.setTransaction('/abc');
      scope.setTransaction();
      expect((scope as any)._transaction).toBeUndefined();
    });
  });

  describe('context', () => {
    test('set', () => {
      const scope = new Scope();
      scope.setContext('os', { id: '1' });
      expect((scope as any)._context.os).toEqual({ id: '1' });
    });
    test('unset', () => {
      const scope = new Scope();
      scope.setContext('os', { id: '1' });
      scope.setContext('os', null);
      expect((scope as any)._user).toEqual({});
    });
  });

  describe('span', () => {
    test('set', () => {
      const scope = new Scope();
      const span = { fake: 'span' } as any;
      scope.setSpan(span);
      expect((scope as any)._span).toEqual(span);
    });
    test('unset', () => {
      const scope = new Scope();
      scope.setSpan({ fake: 'span' } as any);
      scope.setSpan();
      expect((scope as any)._span).toEqual(undefined);
    });
  });

  test('chaining', () => {
    const scope = new Scope();
    scope.setLevel(Severity.Critical).setUser({ id: '1' });
    expect((scope as any)._level).toEqual(Severity.Critical);
    expect((scope as any)._user).toEqual({ id: '1' });
  });

  test('basic inheritance', () => {
    const parentScope = new Scope();
    parentScope.setExtra('a', 1);
    const scope = Scope.clone(parentScope);
    expect((parentScope as any)._extra).toEqual((scope as any)._extra);
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

  test('applyToEvent', () => {
    expect.assertions(8);
    const scope = new Scope();
    scope.setExtra('a', 2);
    scope.setTag('a', 'b');
    scope.setUser({ id: '1' });
    scope.setFingerprint(['abcd']);
    scope.setLevel(Severity.Warning);
    scope.setTransaction('/abc');
    scope.addBreadcrumb({ message: 'test' }, 100);
    scope.setContext('os', { id: '1' });
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

  test('applyToEvent merge', () => {
    expect.assertions(8);
    const scope = new Scope();
    scope.setExtra('a', 2);
    scope.setTag('a', 'b');
    scope.setUser({ id: '1' });
    scope.setFingerprint(['abcd']);
    scope.addBreadcrumb({ message: 'test' }, 100);
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

  test('applyToEvent message fingerprint', async () => {
    expect.assertions(1);
    const scope = new Scope();
    const event: Event = {
      fingerprint: ['bar'],
      message: 'foo',
    };
    return scope.applyToEvent(event).then(processedEvent => {
      expect(processedEvent!.fingerprint).toEqual(['bar']);
    });
  });

  test('applyToEvent scope level should be stronger', () => {
    expect.assertions(1);
    const scope = new Scope();
    scope.setLevel(Severity.Warning);
    const event: Event = {};
    event.level = Severity.Critical;
    return scope.applyToEvent(event).then(processedEvent => {
      expect(processedEvent!.level).toEqual('warning');
    });
  });

  test('applyToEvent scope transaction should be stronger', () => {
    expect.assertions(1);
    const scope = new Scope();
    scope.setTransaction('/abc');
    const event: Event = {};
    event.transaction = '/cdf';
    return scope.applyToEvent(event).then(processedEvent => {
      expect(processedEvent!.transaction).toEqual('/abc');
    });
  });

  test('clear', () => {
    const scope = new Scope();
    scope.setExtra('a', 2);
    scope.setTag('a', 'b');
    scope.setUser({ id: '1' });
    scope.setFingerprint(['abcd']);
    scope.addBreadcrumb({ message: 'test' }, 100);
    expect((scope as any)._extra).toEqual({ a: 2 });
    scope.clear();
    expect((scope as any)._extra).toEqual({});
  });

  test('clearBreadcrumbs', () => {
    const scope = new Scope();
    scope.addBreadcrumb({ message: 'test' }, 100);
    expect((scope as any)._breadcrumbs).toHaveLength(1);
    scope.clearBreadcrumbs();
    expect((scope as any)._breadcrumbs).toHaveLength(0);
  });

  test('addEventProcessor', () => {
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

  test('addEventProcessor + global', () => {
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

  test('addEventProcessor async', async () => {
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

  test('addEventProcessor async with reject', async () => {
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

  test('addEventProcessor return null', () => {
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

  test('addEventProcessor pass along hint', () => {
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

  test('listeners', () => {
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
