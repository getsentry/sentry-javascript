import { Event } from '@sentry/types';

import { getCurrentHub, Hub, Scope } from '../src';

const clientFn: any = jest.fn();

describe('Hub', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('call bindClient with provided client when constructing new instance', () => {
    const testClient: any = { setupIntegrations: jest.fn() };
    const spy = jest.spyOn(Hub.prototype, 'bindClient');
    new Hub(testClient);
    expect(spy).toHaveBeenCalledWith(testClient);
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
    // @ts-ignore we want to able to call private method
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

    describe('bindClient', () => {
      test('should override current client', () => {
        const testClient: any = { setupIntegrations: jest.fn() };
        const nextClient: any = { setupIntegrations: jest.fn() };
        const hub = new Hub(testClient);
        hub.bindClient(nextClient);
        expect(hub.getStack()).toHaveLength(1);
        expect(hub.getStack()[0].client).toBe(nextClient);
      });

      test('should bind client to the top-most layer', () => {
        const testClient: any = { bla: 'a' };
        const nextClient: any = { foo: 'bar' };
        const hub = new Hub(testClient);
        hub.pushScope();
        hub.bindClient(nextClient);
        expect(hub.getStack()).toHaveLength(2);
        expect(hub.getStack()[0].client).toBe(testClient);
        expect(hub.getStack()[1].client).toBe(nextClient);
      });

      test('should call setupIntegration method of passed client', () => {
        const testClient: any = { setupIntegrations: jest.fn() };
        const nextClient: any = { setupIntegrations: jest.fn() };
        const hub = new Hub(testClient);
        hub.bindClient(nextClient);
        expect(testClient.setupIntegrations).toHaveBeenCalled();
        expect(nextClient.setupIntegrations).toHaveBeenCalled();
      });
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
    let hub: Hub;

    beforeEach(() => {
      hub = new Hub();
    });

    test('simple', () => {
      hub.withScope(() => {
        expect(hub.getStack()).toHaveLength(2);
      });
      expect(hub.getStack()).toHaveLength(1);
    });

    test('bindClient', () => {
      const testClient: any = { bla: 'a' };
      hub.withScope(() => {
        hub.bindClient(testClient);
        expect(hub.getStack()).toHaveLength(2);
        expect(hub.getStack()[1].client).toBe(testClient);
      });
      expect(hub.getStack()).toHaveLength(1);
    });

    test('should bubble up exceptions', () => {
      const error = new Error('test');
      expect(() => {
        hub.withScope(() => {
          throw error;
        });
      }).toThrow(error);
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
    test('should have an access to provide scope', () => {
      const localScope = new Scope();
      localScope.setExtra('a', 'b');
      const hub = new Hub({} as any, localScope);
      const cb = jest.fn();
      hub.configureScope(cb);
      expect(cb).toHaveBeenCalledWith(localScope);
    });

    test('should not invoke without client and scope', () => {
      const hub = new Hub();
      const cb = jest.fn();
      hub.configureScope(cb);
      expect(cb).not.toHaveBeenCalled();
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
      // @ts-ignore Says mock object is type unknown
      expect(spy.mock.calls[0][2].event_id).toBeTruthy();
    });

    test('should generate hint if not provided in the call', () => {
      const hub = new Hub();
      const spy = jest.spyOn(hub as any, '_invokeClient');
      const ex = new Error('foo');
      hub.captureException(ex);
      // @ts-ignore Says mock object is type unknown
      expect(spy.mock.calls[0][2].originalException).toBe(ex);
      // @ts-ignore Says mock object is type unknown
      expect(spy.mock.calls[0][2].syntheticException).toBeInstanceOf(Error);
      // @ts-ignore Says mock object is type unknown
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
      // @ts-ignore Says mock object is type unknown
      expect(spy.mock.calls[0][3].event_id).toBeTruthy();
    });

    test('should generate hint if not provided in the call', () => {
      const hub = new Hub();
      const spy = jest.spyOn(hub as any, '_invokeClient');
      hub.captureMessage('foo');
      // @ts-ignore Says mock object is type unknown
      expect(spy.mock.calls[0][3].originalException).toBe('foo');
      // @ts-ignore Says mock object is type unknown
      expect(spy.mock.calls[0][3].syntheticException).toBeInstanceOf(Error);
      // @ts-ignore Says mock object is type unknown
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
      // @ts-ignore Says mock object is type unknown
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

  describe('run', () => {
    test('simple', () => {
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

    test('should bubble up exceptions', () => {
      const hub = new Hub();
      const error = new Error('test');
      expect(() => {
        hub.run(() => {
          throw error;
        });
      }).toThrow(error);
    });
  });

  describe('breadcrumbs', () => {
    test('withScope', () => {
      expect.assertions(6);
      const hub = new Hub(clientFn);
      hub.addBreadcrumb({ message: 'My Breadcrumb' });
      hub.withScope(scope => {
        scope.addBreadcrumb({ message: 'scope breadcrumb' });
        const event: Event = {};
        void scope
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
            // eslint-disable-next-line no-console
            console.error(e);
          });
      });
    });
  });
});
