/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable deprecation/deprecation */

import type { Client, Event, EventType } from '@sentry/types';

import { getCurrentHub, Hub, Scope } from '../src';

const clientFn: any = jest.fn();

function makeClient() {
  return {
    getOptions: jest.fn(),
    captureEvent: jest.fn(),
    captureException: jest.fn(),
    close: jest.fn(),
    flush: jest.fn(),
    getDsn: jest.fn(),
    getIntegration: jest.fn(),
    setupIntegrations: jest.fn(),
    captureMessage: jest.fn(),
  } as unknown as Client;
}

/**
 * Return an array containing the arguments passed to the given mocked or spied-upon function.
 *
 * By default, the args passed to the first call of the function are returned, but it is also possible to retrieve the
 * nth call by passing `callIndex`. If the function wasn't called, an error message is returned instead.
 */
function getPassedArgs(mock: (...args: any[]) => any, callIndex: number = 0): any[] {
  const asMock = mock as jest.MockedFunction<(...args: any[]) => any>;
  return asMock.mock.calls[callIndex] || ["Error: Function wasn't called."];
}

describe('Hub', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('call bindClient with provided client when constructing new instance', () => {
    const testClient = makeClient();
    const hub = new Hub(testClient);
    expect(hub.getClient()).toBe(testClient);
  });

  test('push process into stack', () => {
    const hub = new Hub();
    expect(hub.getStack()).toHaveLength(1);
  });

  test('pass in filled layer', () => {
    const hub = new Hub(clientFn);
    expect(hub.getStack()).toHaveLength(1);
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
      expect((hub.getStack()[1].scope as Scope as any)._extra).toEqual({ a: 'b' });
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
        const testClient = makeClient();
        const nextClient = makeClient();
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
        const testClient = makeClient();
        const nextClient = makeClient();
        const hub = new Hub(testClient);
        hub.bindClient(nextClient);
        expect(testClient.setupIntegrations).toHaveBeenCalled();
        expect(nextClient.setupIntegrations).toHaveBeenCalled();
      });
    });

    test('inherit processors', async () => {
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
      const testClient = makeClient();
      const hub = new Hub(testClient);

      hub.captureException('a');
      const args = getPassedArgs(testClient.captureException);

      expect(args[0]).toBe('a');
    });

    test('should set event_id in hint', () => {
      const testClient = makeClient();
      const hub = new Hub(testClient);

      hub.captureException('a');
      const args = getPassedArgs(testClient.captureException);

      expect(args[1].event_id).toBeTruthy();
    });

    test('should keep event_id from hint', () => {
      const testClient = makeClient();
      const hub = new Hub(testClient);
      const id = Math.random().toString();

      hub.captureException('a', { event_id: id });
      const args = getPassedArgs(testClient.captureException);

      expect(args[1].event_id).toBe(id);
    });

    test('should generate hint if not provided in the call', () => {
      const testClient = makeClient();
      const hub = new Hub(testClient);
      const ex = new Error('foo');

      hub.captureException(ex);
      const args = getPassedArgs(testClient.captureException);

      expect(args[1].originalException).toBe(ex);
      expect(args[1].syntheticException).toBeInstanceOf(Error);
      expect(args[1].syntheticException.message).toBe('Sentry syntheticException');
    });
  });

  describe('captureMessage', () => {
    test('simple', () => {
      const testClient = makeClient();
      const hub = new Hub(testClient);

      hub.captureMessage('a');
      const args = getPassedArgs(testClient.captureMessage);

      expect(args[0]).toBe('a');
    });

    test('should set event_id in hint', () => {
      const testClient = makeClient();
      const hub = new Hub(testClient);

      hub.captureMessage('a');
      const args = getPassedArgs(testClient.captureMessage);

      expect(args[2].event_id).toBeTruthy();
    });

    test('should keep event_id from hint', () => {
      const testClient = makeClient();
      const hub = new Hub(testClient);
      const id = Math.random().toString();

      hub.captureMessage('a', undefined, { event_id: id });
      const args = getPassedArgs(testClient.captureMessage);

      expect(args[2].event_id).toBe(id);
    });

    test('should generate hint if not provided in the call', () => {
      const testClient = makeClient();
      const hub = new Hub(testClient);

      hub.captureMessage('foo');
      const args = getPassedArgs(testClient.captureMessage);

      expect(args[2].originalException).toBe('foo');
      expect(args[2].syntheticException).toBeInstanceOf(Error);
      expect(args[2].syntheticException.message).toBe('foo');
    });
  });

  describe('captureEvent', () => {
    test('simple', () => {
      const event: Event = {
        extra: { b: 3 },
      };
      const testClient = makeClient();
      const hub = new Hub(testClient);

      hub.captureEvent(event);
      const args = getPassedArgs(testClient.captureEvent);

      expect(args[0]).toBe(event);
    });

    test('should set event_id in hint', () => {
      const event: Event = {
        extra: { b: 3 },
      };
      const testClient = makeClient();
      const hub = new Hub(testClient);

      hub.captureEvent(event);
      const args = getPassedArgs(testClient.captureEvent);

      expect(args[1].event_id).toBeTruthy();
    });

    test('should keep event_id from hint', () => {
      const event: Event = {
        extra: { b: 3 },
      };
      const testClient = makeClient();
      const hub = new Hub(testClient);
      const id = Math.random().toString();

      hub.captureEvent(event, { event_id: id });
      const args = getPassedArgs(testClient.captureEvent);

      expect(args[1].event_id).toBe(id);
    });

    test('sets lastEventId', () => {
      const event: Event = {
        extra: { b: 3 },
      };
      const testClient = makeClient();
      const hub = new Hub(testClient);

      hub.captureEvent(event);
      const args = getPassedArgs(testClient.captureEvent);

      expect(args[1].event_id).toEqual(hub.lastEventId());
    });

    const eventTypesToIgnoreLastEventId: EventType[] = ['transaction', 'replay_event'];
    it.each(eventTypesToIgnoreLastEventId)('eventType %s does not set lastEventId', eventType => {
      const event: Event = {
        extra: { b: 3 },
        type: eventType,
      };
      const testClient = makeClient();
      const hub = new Hub(testClient);

      hub.captureEvent(event);
      const args = getPassedArgs(testClient.captureEvent);

      expect(args[1].event_id).not.toEqual(hub.lastEventId());
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

  describe('shouldSendDefaultPii()', () => {
    test('return false if sendDefaultPii is not set', () => {
      const testClient = makeClient();
      const hub = new Hub(testClient);
      expect(hub.shouldSendDefaultPii()).toBe(false);
    });

    test('return true if sendDefaultPii is set in the client options', () => {
      const testClient = makeClient();
      testClient.getOptions = () => {
        return {
          sendDefaultPii: true,
        } as unknown as any;
      };
      const hub = new Hub(testClient);
      expect(hub.shouldSendDefaultPii()).toBe(true);
    });
  });
});
