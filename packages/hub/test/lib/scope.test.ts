import { SentryEvent, SentryEventHint } from '@sentry/types';
import { Scope } from '../../src';

describe('Scope', () => {
  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  test('fingerprint', () => {
    const scope = new Scope();
    scope.setFingerprint(['abcd']);
    expect(scope.getFingerprint()).toEqual(['abcd']);
  });

  test('extra', () => {
    const scope = new Scope();
    scope.setExtra('a', 1);
    expect(scope.getExtra()).toEqual({ a: 1 });
  });

  test('tags', () => {
    const scope = new Scope();
    scope.setTag('a', 'b');
    expect(scope.getTags()).toEqual({ a: 'b' });
  });

  test('user', () => {
    const scope = new Scope();
    scope.setUser({ id: '1' });
    expect(scope.getUser()).toEqual({ id: '1' });
  });

  test('breadcrumbs', () => {
    const scope = new Scope();
    scope.addBreadcrumb({ message: 'test' }, 100);
    expect(scope.getBreadcrumbs()).toEqual([{ message: 'test' }]);
  });

  test('basic inheritance', () => {
    const parentScope = new Scope();
    parentScope.setExtra('a', 1);
    const scope = Scope.clone(parentScope);
    expect(parentScope.getExtra()).toEqual(scope.getExtra());
  });

  test('parent changed inheritance', () => {
    const parentScope = new Scope();
    const scope = Scope.clone(parentScope);
    parentScope.setExtra('a', 2);
    expect(scope.getExtra()).toEqual({});
    expect(parentScope.getExtra()).toEqual({ a: 2 });
  });

  test('child override inheritance', () => {
    const parentScope = new Scope();
    parentScope.setExtra('a', 1);

    const scope = Scope.clone(parentScope);
    scope.setExtra('a', 2);
    expect(parentScope.getExtra()).toEqual({ a: 1 });
    expect(scope.getExtra()).toEqual({ a: 2 });
  });

  test('listeners', () => {
    jest.useFakeTimers();
    const scope = new Scope();
    const listener = jest.fn();
    scope.addScopeListener(listener);
    scope.setExtra('a', 2);
    jest.runAllTimers();
    expect(listener).toHaveBeenCalled();
    expect(listener.mock.calls[0][0].extra).toEqual({ a: 2 });
  });

  test('applyToEvent', async () => {
    const scope = new Scope();
    scope.setExtra('a', 2);
    scope.setTag('a', 'b');
    scope.setUser({ id: '1' });
    scope.setFingerprint(['abcd']);
    scope.addBreadcrumb({ message: 'test' }, 100);
    const event: SentryEvent = {};
    await scope.applyToEvent(event);
    expect(event.extra).toEqual({ a: 2 });
    expect(event.tags).toEqual({ a: 'b' });
    expect(event.user).toEqual({ id: '1' });
    expect(event.fingerprint).toEqual(['abcd']);
    expect(event.breadcrumbs).toEqual([{ message: 'test' }]);
  });

  test('applyToEvent merge', async () => {
    const scope = new Scope();
    scope.setExtra('a', 2);
    scope.setTag('a', 'b');
    scope.setUser({ id: '1' });
    scope.setFingerprint(['abcd']);
    scope.addBreadcrumb({ message: 'test' }, 100);
    const event: SentryEvent = {
      breadcrumbs: [{ message: 'test2' }],
      extra: { b: 3 },
      fingerprint: ['efgh'],
      tags: { b: 'c' },
      user: { id: '3' },
    };
    await scope.applyToEvent(event);
    expect(event.extra).toEqual({ a: 2, b: 3 });
    expect(event.tags).toEqual({ a: 'b', b: 'c' });
    expect(event.user).toEqual({ id: '3' });
    expect(event.fingerprint).toEqual(['efgh']);
    expect(event.breadcrumbs).toEqual([{ message: 'test2' }]);
  });

  test('clear', () => {
    const scope = new Scope();
    scope.setExtra('a', 2);
    scope.setTag('a', 'b');
    scope.setUser({ id: '1' });
    scope.setFingerprint(['abcd']);
    scope.addBreadcrumb({ message: 'test' }, 100);
    expect(scope.getExtra()).toEqual({ a: 2 });
    scope.clear();
    expect(scope.getExtra()).toEqual({});
  });

  test('addEventProcessor', async done => {
    expect.assertions(2);
    const event: SentryEvent = {
      extra: { b: 3 },
    };
    const localScope = new Scope();
    localScope.setExtra('a', 'b');
    localScope.addEventProcessor(async (processedEvent: SentryEvent) => {
      expect(processedEvent.extra).toEqual({ a: 'b', b: 3 });
      return processedEvent;
    });
    localScope.addEventProcessor(async (processedEvent: SentryEvent) => {
      processedEvent.dist = '1';
      return processedEvent;
    });
    localScope.addEventProcessor(async (processedEvent: SentryEvent) => {
      expect(processedEvent.dist).toEqual('1');
      done();
      return processedEvent;
    });
    await localScope.applyToEvent(event);
  });

  test('addEventProcessor async', async () => {
    expect.assertions(6);
    const event: SentryEvent = {
      extra: { b: 3 },
    };
    const localScope = new Scope();
    localScope.setExtra('a', 'b');
    const callCounter = jest.fn();
    localScope.addEventProcessor(async (processedEvent: SentryEvent) => {
      callCounter(1);
      expect(processedEvent.extra).toEqual({ a: 'b', b: 3 });
      return processedEvent;
    });
    localScope.addEventProcessor(
      async (processedEvent: SentryEvent) =>
        new Promise<SentryEvent>(resolve => {
          callCounter(2);
          setTimeout(() => {
            callCounter(3);
            processedEvent.dist = '1';
            resolve(processedEvent);
          }, 1);
        }),
    );
    localScope.addEventProcessor(async (processedEvent: SentryEvent) => {
      callCounter(4);
      return processedEvent;
    });
    const final = await localScope.applyToEvent(event);
    expect(callCounter.mock.calls[0][0]).toBe(1);
    expect(callCounter.mock.calls[1][0]).toBe(2);
    expect(callCounter.mock.calls[2][0]).toBe(3);
    expect(callCounter.mock.calls[3][0]).toBe(4);
    expect(final!.dist).toEqual('1');
  });

  test('addEventProcessor return null', async () => {
    expect.assertions(1);
    const event: SentryEvent = {
      extra: { b: 3 },
    };
    const localScope = new Scope();
    localScope.setExtra('a', 'b');
    localScope.addEventProcessor(async (_: SentryEvent) => null);
    const final = await localScope.applyToEvent(event);
    expect(final).toBeNull();
  });

  test('addEventProcessor pass along hint', async () => {
    expect.assertions(3);
    const event: SentryEvent = {
      extra: { b: 3 },
    };
    const localScope = new Scope();
    localScope.setExtra('a', 'b');
    localScope.addEventProcessor(async (internalEvent: SentryEvent, hint?: SentryEventHint) => {
      expect(hint).toBeTruthy();
      expect(hint!.syntheticException).toBeTruthy();
      return internalEvent;
    });
    const final = await localScope.applyToEvent(event, { syntheticException: new Error('what') });
    expect(final).toEqual(event);
  });
});
