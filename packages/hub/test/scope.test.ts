import { SentryEvent, SentryEventHint, Severity } from '@sentry/types';
import { Scope } from '../src';

describe('Scope', () => {
  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  test('fingerprint', () => {
    const scope = new Scope();
    scope.setFingerprint(['abcd']);
    expect((scope as any).fingerprint).toEqual(['abcd']);
  });

  test('extra', () => {
    const scope = new Scope();
    scope.setExtra('a', 1);
    expect((scope as any).extra).toEqual({ a: 1 });
  });

  test('tags', () => {
    const scope = new Scope();
    scope.setTag('a', 'b');
    expect((scope as any).tags).toEqual({ a: 'b' });
  });

  test('user', () => {
    const scope = new Scope();
    scope.setUser({ id: '1' });
    expect((scope as any).user).toEqual({ id: '1' });
  });

  test('breadcrumbs', () => {
    const scope = new Scope();
    scope.addBreadcrumb({ message: 'test' }, 100);
    expect((scope as any).breadcrumbs).toEqual([{ message: 'test' }]);
  });

  test('level', () => {
    const scope = new Scope();
    scope.setLevel(Severity.Critical);
    expect((scope as any).level).toEqual(Severity.Critical);
  });

  test('chaining', () => {
    const scope = new Scope();
    scope.setLevel(Severity.Critical).setUser({ id: '1' });
    expect((scope as any).level).toEqual(Severity.Critical);
    expect((scope as any).user).toEqual({ id: '1' });
  });

  test('basic inheritance', () => {
    const parentScope = new Scope();
    parentScope.setExtra('a', 1);
    const scope = Scope.clone(parentScope);
    expect((parentScope as any).extra).toEqual((scope as any).extra);
  });

  test('parent changed inheritance', () => {
    const parentScope = new Scope();
    const scope = Scope.clone(parentScope);
    parentScope.setExtra('a', 2);
    expect((scope as any).extra).toEqual({});
    expect((parentScope as any).extra).toEqual({ a: 2 });
  });

  test('child override inheritance', () => {
    const parentScope = new Scope();
    parentScope.setExtra('a', 1);

    const scope = Scope.clone(parentScope);
    scope.setExtra('a', 2);
    expect((parentScope as any).extra).toEqual({ a: 1 });
    expect((scope as any).extra).toEqual({ a: 2 });
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

  test('applyToEvent', () => {
    expect.assertions(6);
    const scope = new Scope();
    scope.setExtra('a', 2);
    scope.setTag('a', 'b');
    scope.setUser({ id: '1' });
    scope.setFingerprint(['abcd']);
    scope.setLevel(Severity.Warning);
    scope.addBreadcrumb({ message: 'test' }, 100);
    const event: SentryEvent = {};
    return scope.applyToEvent(event).then(processedEvent => {
      expect(processedEvent!.extra).toEqual({ a: 2 });
      expect(processedEvent!.tags).toEqual({ a: 'b' });
      expect(processedEvent!.user).toEqual({ id: '1' });
      expect(processedEvent!.fingerprint).toEqual(['abcd']);
      expect(processedEvent!.level).toEqual('warning');
      expect(processedEvent!.breadcrumbs).toEqual([{ message: 'test' }]);
    });
  });

  test('applyToEvent merge', () => {
    expect.assertions(5);
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
    return scope.applyToEvent(event).then(processedEvent => {
      expect(processedEvent!.extra).toEqual({ a: 2, b: 3 });
      expect(processedEvent!.tags).toEqual({ a: 'b', b: 'c' });
      expect(processedEvent!.user).toEqual({ id: '3' });
      expect(processedEvent!.fingerprint).toEqual(['efgh', 'abcd']);
      expect(processedEvent!.breadcrumbs).toEqual([{ message: 'test2' }]);
    });
  });

  test('applyToEvent message fingerprint', async () => {
    expect.assertions(1);
    const scope = new Scope();
    const event: SentryEvent = {
      fingerprint: ['bar'],
      message: 'foo',
    };
    return scope.applyToEvent(event).then(processedEvent => {
      expect(processedEvent!.fingerprint).toEqual(['bar', 'foo']);
    });
  });

  test('applyToEvent scope level should be stronger', () => {
    expect.assertions(1);
    const scope = new Scope();
    scope.setLevel(Severity.Warning);
    const event: SentryEvent = {};
    event.level = Severity.Critical;
    return scope.applyToEvent(event).then(processedEvent => {
      expect(processedEvent!.level).toEqual('warning');
    });
  });

  test('clear', () => {
    const scope = new Scope();
    scope.setExtra('a', 2);
    scope.setTag('a', 'b');
    scope.setUser({ id: '1' });
    scope.setFingerprint(['abcd']);
    scope.addBreadcrumb({ message: 'test' }, 100);
    expect((scope as any).extra).toEqual({ a: 2 });
    scope.clear();
    expect((scope as any).extra).toEqual({});
  });

  test('addEventProcessor', () => {
    expect.assertions(3);
    const event: SentryEvent = {
      extra: { b: 3 },
    };
    const localScope = new Scope();
    localScope.setExtra('a', 'b');
    localScope.addEventProcessor((processedEvent: SentryEvent) => {
      expect(processedEvent.extra).toEqual({ a: 'b', b: 3 });
      return processedEvent;
    });
    localScope.addEventProcessor((processedEvent: SentryEvent) => {
      processedEvent.dist = '1';
      return processedEvent;
    });
    localScope.addEventProcessor((processedEvent: SentryEvent) => {
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
    const event: SentryEvent = {
      extra: { b: 3 },
    };
    const localScope = new Scope();
    localScope.setExtra('a', 'b');
    const callCounter = jest.fn();
    localScope.addEventProcessor((processedEvent: SentryEvent) => {
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
          jest.runAllTimers();
        }),
    );
    localScope.addEventProcessor((processedEvent: SentryEvent) => {
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
    const event: SentryEvent = {
      extra: { b: 3 },
    };
    const localScope = new Scope();
    localScope.setExtra('a', 'b');
    const callCounter = jest.fn();
    localScope.addEventProcessor((processedEvent: SentryEvent) => {
      callCounter(1);
      expect(processedEvent.extra).toEqual({ a: 'b', b: 3 });
      return processedEvent;
    });
    localScope.addEventProcessor(
      async (_processedEvent: SentryEvent) =>
        new Promise<SentryEvent>((_, reject) => {
          setTimeout(() => {
            reject('bla');
          }, 1);
          jest.runAllTimers();
        }),
    );
    localScope.addEventProcessor((processedEvent: SentryEvent) => {
      callCounter(4);
      return processedEvent;
    });

    return localScope.applyToEvent(event).catch(reason => {
      expect(reason).toEqual('bla');
    });
  });

  test('addEventProcessor return null', () => {
    expect.assertions(1);
    const event: SentryEvent = {
      extra: { b: 3 },
    };
    const localScope = new Scope();
    localScope.setExtra('a', 'b');
    localScope.addEventProcessor(async (_: SentryEvent) => null);
    return localScope.applyToEvent(event).then(processedEvent => {
      expect(processedEvent).toBeNull();
    });
  });

  test('addEventProcessor pass along hint', () => {
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
    return localScope.applyToEvent(event, { syntheticException: new Error('what') }).then(processedEvent => {
      expect(processedEvent).toEqual(event);
    });
  });
});
