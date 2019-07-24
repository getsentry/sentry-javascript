import { Event } from '@sentry/types';

import { getCurrentHub, Hub, Scope } from '../src';

const clientFn: any = jest.fn();

describe('Hub', () => {
  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  test('push process into stack', () => {
    const hub = new Hub();
    expect(hub.getStack()).toHaveLength(1);
  });

  test('pass in filled layer', () => {
    const hub = new Hub(clientFn);
    expect(hub.getStack()).toHaveLength(1);
  });

  test("don't invoke client sync with wrong func", () => {
    const hub = new Hub(clientFn);
    // @ts-ignore
    hub._invokeClient('funca', true);
    expect(clientFn).not.toHaveBeenCalled();
  });

  test('isOlderThan', () => {
    const hub = new Hub();
    expect(hub.isOlderThan(0)).toBeFalsy();
  });

  describe('pushScope', () => {
    test('simple', () => {
      const localScope = new Scope();
      localScope.setExtra('a', 'b');
      const hub = new Hub(undefined, localScope);
      hub.pushScope();
      expect(hub.getStack()).toHaveLength(2);
      expect(hub.getStack()[1].scope).not.toBe(localScope);
      expect(((hub.getStack()[1].scope as Scope) as any)._extra).toEqual({ a: 'b' });
    });

    test('inherit client', () => {
      const testClient: any = { bla: 'a' };
      const hub = new Hub(testClient);
      hub.pushScope();
      expect(hub.getStack()).toHaveLength(2);
      expect(hub.getStack()[1].client).toBe(testClient);
    });

    test('bindClient', () => {
      const testClient: any = { bla: 'a' };
      const hub = new Hub(testClient);
      const ndClient: any = { foo: 'bar' };
      hub.pushScope();
      hub.bindClient(ndClient);
      expect(hub.getStack()).toHaveLength(2);
      expect(hub.getStack()[0].client).toBe(testClient);
      expect(hub.getStack()[1].client).toBe(ndClient);
    });

    test('inherit processors', () => {
      expect.assertions(1);
      const event: Event = {
        extra: { b: 3 },
      };
      const localScope = new Scope();
      localScope.setExtra('a', 'b');
      const hub = new Hub({ a: 'b' } as any, localScope);

      localScope.addEventProcessor(async (processedEvent: Event) => {
        processedEvent.dist = '1';
        return processedEvent;
      });

      hub.pushScope();
      const pushedScope = hub.getStackTop().scope;

      return pushedScope!.applyToEvent(event).then(final => {
        expect(final!.dist).toEqual('1');
      });
    });
  });

  test('popScope', () => {
    const hub = new Hub();
    hub.pushScope();
    expect(hub.getStack()).toHaveLength(2);
    hub.popScope();
    expect(hub.getStack()).toHaveLength(1);
  });

  describe('withScope', () => {
    test('simple', () => {
      const hub = new Hub();
      hub.withScope(() => {
        expect(hub.getStack()).toHaveLength(2);
      });
      expect(hub.getStack()).toHaveLength(1);
    });

    test('bindClient', () => {
      const hub = new Hub();
      const testClient: any = { bla: 'a' };
      hub.withScope(() => {
        hub.bindClient(testClient);
        expect(hub.getStack()).toHaveLength(2);
        expect(hub.getStack()[1].client).toBe(testClient);
      });
      expect(hub.getStack()).toHaveLength(1);
    });
  });

  test('getCurrentClient', () => {
    const testClient: any = { bla: 'a' };
    const hub = new Hub(testClient);
    expect(hub.getClient()).toBe(testClient);
  });

  test('getStack', () => {
    const client: any = { a: 'b' };
    const hub = new Hub(client);
    expect(hub.getStack()[0].client).toBe(client);
  });

  test('getStackTop', () => {
    const testClient: any = { bla: 'a' };
    const hub = new Hub();
    hub.pushScope();
    hub.pushScope();
    hub.bindClient(testClient);
    expect(hub.getStackTop().client).toEqual({ bla: 'a' });
  });

  describe('configureScope', () => {
    test('no client, should not invoke configureScope', () => {
      expect.assertions(0);
      const hub = new Hub();
      hub.configureScope(_ => {
        expect(true).toBeFalsy();
      });
    });

    test('no client, should not invoke configureScope', () => {
      expect.assertions(1);
      const localScope = new Scope();
      localScope.setExtra('a', 'b');
      const hub = new Hub({ a: 'b' } as any, localScope);
      hub.configureScope(confScope => {
        expect((confScope as any)._extra).toEqual({ a: 'b' });
      });
    });
  });

  describe('captureException', () => {
    test('simple', () => {
      const hub = new Hub();
      const spy = jest.spyOn(hub as any, '_invokeClient');
      hub.captureException('a');
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0]).toBe('captureException');
      expect(spy.mock.calls[0][1]).toBe('a');
    });

    test('should set event_id in hint', () => {
      const hub = new Hub();
      const spy = jest.spyOn(hub as any, '_invokeClient');
      hub.captureException('a');
      expect(spy.mock.calls[0][2].event_id).toBeTruthy();
    });

    test('should generate hint if not provided in the call', () => {
      const hub = new Hub();
      const spy = jest.spyOn(hub as any, '_invokeClient');
      const ex = new Error('foo');
      hub.captureException(ex);
      expect(spy.mock.calls[0][2].originalException).toBe(ex);
      expect(spy.mock.calls[0][2].syntheticException).toBeInstanceOf(Error);
      expect(spy.mock.calls[0][2].syntheticException.message).toBe('Sentry syntheticException');
    });
  });

  describe('captureMessage', () => {
    test('simple', () => {
      const hub = new Hub();
      const spy = jest.spyOn(hub as any, '_invokeClient');
      hub.captureMessage('a');
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0]).toBe('captureMessage');
      expect(spy.mock.calls[0][1]).toBe('a');
    });

    test('should set event_id in hint', () => {
      const hub = new Hub();
      const spy = jest.spyOn(hub as any, '_invokeClient');
      hub.captureMessage('a');
      expect(spy.mock.calls[0][3].event_id).toBeTruthy();
    });

    test('should generate hint if not provided in the call', () => {
      const hub = new Hub();
      const spy = jest.spyOn(hub as any, '_invokeClient');
      hub.captureMessage('foo');
      expect(spy.mock.calls[0][3].originalException).toBe('foo');
      expect(spy.mock.calls[0][3].syntheticException).toBeInstanceOf(Error);
      expect(spy.mock.calls[0][3].syntheticException.message).toBe('foo');
    });
  });

  describe('captureEvent', () => {
    test('simple', () => {
      const event: Event = {
        extra: { b: 3 },
      };
      const hub = new Hub();
      const spy = jest.spyOn(hub as any, '_invokeClient');
      hub.captureEvent(event);
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0]).toBe('captureEvent');
      expect(spy.mock.calls[0][1]).toBe(event);
    });

    test('should set event_id in hint', () => {
      const event: Event = {
        extra: { b: 3 },
      };
      const hub = new Hub();
      const spy = jest.spyOn(hub as any, '_invokeClient');
      hub.captureEvent(event);
      expect(spy.mock.calls[0][2].event_id).toBeTruthy();
    });
  });

  test('lastEventId should be the same as last created', () => {
    const event: Event = {
      extra: { b: 3 },
    };
    const hub = new Hub();
    const eventId = hub.captureEvent(event);
    expect(eventId).toBe(hub.lastEventId());
  });

  test('run', () => {
    const currentHub = getCurrentHub();
    const myScope = new Scope();
    const myClient: any = { a: 'b' };
    myScope.setExtra('a', 'b');
    const myHub = new Hub(myClient, myScope);
    myHub.run(hub => {
      expect(hub.getScope()).toBe(myScope);
      expect(hub.getClient()).toBe(myClient);
      expect(hub).toBe(getCurrentHub());
    });
    expect(currentHub).toBe(getCurrentHub());
  });

  describe('breadcrumbs', () => {
    test('withScope', () => {
      expect.assertions(6);
      const hub = new Hub(clientFn);
      hub.addBreadcrumb({ message: 'My Breadcrumb' });
      hub.withScope(scope => {
        scope.addBreadcrumb({ message: 'scope breadcrumb' });
        const event: Event = {};
        scope
          .applyToEvent(event)
          .then((appliedEvent: Event | null) => {
            expect(appliedEvent).toBeTruthy();
            expect(appliedEvent!.breadcrumbs).toHaveLength(2);
            expect(appliedEvent!.breadcrumbs![0].message).toEqual('My Breadcrumb');
            expect(appliedEvent!.breadcrumbs![0]).toHaveProperty('timestamp');
            expect(appliedEvent!.breadcrumbs![1].message).toEqual('scope breadcrumb');
            expect(appliedEvent!.breadcrumbs![1]).toHaveProperty('timestamp');
          })
          .then(null, e => {
            console.error(e);
          });
      });
    });
  });

  describe('spans', () => {
    describe('start', () => {
      test('simple', () => {
        const hub = new Hub(clientFn);
        const span = hub.startSpan() as any;
        expect(span._spanId).toBeTruthy();
      });

      test('bindOnScope', () => {
        const myScope = new Scope();
        const hub = new Hub(clientFn, myScope);
        const span = hub.startSpan({}, true) as any;
        expect((myScope as any)._span).toBe(span);
      });
    });

    describe('finish', () => {
      test('simple', () => {
        const hub = new Hub(clientFn);
        const span = hub.startSpan() as any;
        expect(span.timestamp).toBeUndefined();
        expect(hub.finishSpan(span)).toBeUndefined();
        expect(span.timestamp).toBeGreaterThan(1);
      });

      test('finish a scope span without transaction', () => {
        const myScope = new Scope();
        const hub = new Hub(clientFn, myScope);
        const spy = jest.spyOn(hub as any, 'captureEvent');
        const span = hub.startSpan({}, true) as any;
        expect(hub.finishSpan(span)).toBeUndefined();
        expect(spy).not.toHaveBeenCalled();
      });

      test('finish a scope span with transaction', () => {
        const myScope = new Scope();
        const hub = new Hub(clientFn, myScope);
        const spy = jest.spyOn(hub as any, 'captureEvent');
        const span = hub.startSpan({ transaction: 'test' }, true) as any;
        expect(hub.finishSpan(span)).toBeDefined();
        expect(spy).toHaveBeenCalled();
        expect(spy.mock.calls[0][0].spans).toBeUndefined();
      });

      test('finish a scope span with transaction + child span', () => {
        const myScope = new Scope();
        const hub = new Hub(clientFn, myScope);
        const spy = jest.spyOn(hub as any, 'captureEvent');
        const span = hub.startSpan({ transaction: 'test' }, true) as any;
        hub.finishSpan(hub.startSpan());
        expect(hub.finishSpan(span)).toBeDefined();
        expect(spy).toHaveBeenCalled();
        expect(spy.mock.calls[0][0].spans).toHaveLength(1);
      });
    });
  });
});
