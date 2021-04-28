import { Client, Event } from '@sentry/types';

import { getCurrentHub, Hub, Scope } from '../src';
import { TestClient } from './mocks/client';

describe('Hub', () => {
  let client: Client;

  beforeEach(() => {
    client = new TestClient();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('call bindClient with provided client when constructing new instance', () => {
    const spy = jest.spyOn(Hub.prototype, 'bindClient');
    new Hub(client);
    expect(spy).toHaveBeenCalledWith(client);
  });

  test('push process into stack', () => {
    const hub = new Hub(client);
    expect(hub.getStack()).toHaveLength(1);
  });

  test('pass in filled layer', () => {
    const hub = new Hub(client);
    expect(hub.getStack()).toHaveLength(1);
  });

  test('isOlderThan', () => {
    const hub = new Hub(client);
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
      const hub = new Hub(client);
      hub.pushScope();
      expect(hub.getStack()).toHaveLength(2);
      expect(hub.getStack()[1].client).toBe(client);
    });

    describe('bindClient', () => {
      test('should override curent client', () => {
        const nextClient = new TestClient();
        const hub = new Hub(client);
        hub.bindClient(nextClient);
        expect(hub.getStack()).toHaveLength(1);
        expect(hub.getStack()[0].client).toBe(nextClient);
      });

      test('should bind client to the top-most layer', () => {
        const nextClient = new TestClient();
        const hub = new Hub(client);
        hub.pushScope();
        hub.bindClient(nextClient);
        expect(hub.getStack()).toHaveLength(2);
        expect(hub.getStack()[0].client).toBe(client);
        expect(hub.getStack()[1].client).toBe(nextClient);
      });

      test('should call setupIntegration method of passed client', () => {
        const nextClient = new TestClient();
        const hub = new Hub(client);
        hub.bindClient(nextClient);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(client.setupIntegrations).toHaveBeenCalled();
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
      const hub = new Hub(client, localScope);

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
    const hub = new Hub(client);
    hub.pushScope();
    expect(hub.getStack()).toHaveLength(2);
    hub.popScope();
    expect(hub.getStack()).toHaveLength(1);
  });

  describe('withScope', () => {
    test('simple', () => {
      const hub = new Hub(client);
      hub.withScope(() => {
        expect(hub.getStack()).toHaveLength(2);
      });
      expect(hub.getStack()).toHaveLength(1);
    });

    test('bindClient', () => {
      const hub = new Hub(client);
      hub.withScope(() => {
        hub.bindClient(client);
        expect(hub.getStack()).toHaveLength(2);
        expect(hub.getStack()[1].client).toBe(client);
      });
      expect(hub.getStack()).toHaveLength(1);
    });
  });

  test('getCurrentClient', () => {
    const hub = new Hub(client);
    expect(hub.getClient()).toBe(client);
  });

  test('getStack', () => {
    const hub = new Hub(client);
    expect(hub.getStack()[0].client).toBe(client);
  });

  test('getStackTop', () => {
    const hub = new Hub(client);
    hub.pushScope();
    hub.pushScope();
    hub.bindClient(client);
    expect(hub.getStackTop().client).toEqual(client);
  });

  describe('configureScope', () => {
    test('should have an access to provide scope', () => {
      const localScope = new Scope();
      localScope.setExtra('a', 'b');
      const hub = new Hub(client, localScope);
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
      const hub = new Hub(client);
      const spy = jest.spyOn(hub as any, '_invokeClient');
      hub.captureException('a');
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0]).toBe('captureException');
      expect(spy.mock.calls[0][1]).toBe('a');
    });

    test('should set event_id in hint', () => {
      const hub = new Hub(client);
      const spy = jest.spyOn(hub as any, '_invokeClient');
      hub.captureException('a');
      // @ts-ignore Says mock object is type unknown
      expect(spy.mock.calls[0][2].event_id).toBeTruthy();
    });

    test('should generate hint if not provided in the call', () => {
      const hub = new Hub(client);
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
      const hub = new Hub(client);
      const spy = jest.spyOn(hub as any, '_invokeClient');
      hub.captureMessage('a');
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0]).toBe('captureMessage');
      expect(spy.mock.calls[0][1]).toBe('a');
    });

    test('should set event_id in hint', () => {
      const hub = new Hub(client);
      const spy = jest.spyOn(hub as any, '_invokeClient');
      hub.captureMessage('a');
      // @ts-ignore Says mock object is type unknown
      expect(spy.mock.calls[0][3].event_id).toBeTruthy();
    });

    test('should generate hint if not provided in the call', () => {
      const hub = new Hub(client);
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
      const hub = new Hub(client);
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
      const hub = new Hub(client);
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
    const hub = new Hub(client);
    const eventId = hub.captureEvent(event);
    expect(eventId).toBe(hub.lastEventId());
  });

  test('run', () => {
    const currentHub = getCurrentHub();
    const myScope = new Scope();
    myScope.setExtra('a', 'b');
    const myHub = new Hub(client, myScope);
    myHub.run(hub => {
      expect(hub.getScope()).toBe(myScope);
      expect(hub.getClient()).toBe(client);
      expect(hub).toBe(getCurrentHub());
    });
    expect(currentHub).toBe(getCurrentHub());
  });

  describe('breadcrumbs', () => {
    test('withScope', () => {
      expect.assertions(6);
      const hub = new Hub(client);
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
            // eslint-disable-next-line no-console
            console.error(e);
          });
      });
    });
  });
});
