import { SentryEvent } from '@sentry/types';
import { logger } from '@sentry/utils/logger';
import { getCurrentHub, Hub, Scope } from '../src';

const clientFn = jest.fn();
const scope = new Scope();

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
    const hub = new Hub({
      clientFn,
    });
    expect(hub.getStack()).toHaveLength(1);
  });

  test('invoke client sync', () => {
    const hub = new Hub(
      {
        clientFn,
      },
      scope,
    );
    // @ts-ignore
    hub.invokeClient('clientFn', true);
    expect(clientFn).toHaveBeenCalled();
    expect(clientFn.mock.calls[0][0]).toBe(true);
    expect(clientFn.mock.calls[0][1]).toBe(scope);
  });

  test("don't invoke client sync with wrong func", () => {
    const hub = new Hub({
      clientFn,
    });
    // @ts-ignore
    hub.invokeClient('funca', true);
    expect(clientFn).not.toHaveBeenCalled();
  });

  test('isOlderThan', () => {
    const hub = new Hub();
    expect(hub.isOlderThan(0)).toBeFalsy();
  });

  test('pushScope', () => {
    const localScope = new Scope();
    localScope.setExtra('a', 'b');
    const hub = new Hub(undefined, localScope);
    hub.pushScope();
    expect(hub.getStack()).toHaveLength(2);
    expect(hub.getStack()[1].scope).not.toBe(localScope);
    expect(((hub.getStack()[1].scope as Scope) as any).extra).toEqual({ a: 'b' });
  });

  test('pushScope inherit client', () => {
    const testClient = { bla: 'a' };
    const hub = new Hub(testClient);
    hub.pushScope();
    expect(hub.getStack()).toHaveLength(2);
    expect(hub.getStack()[1].client).toBe(testClient);
  });

  test('pushScope bindClient', () => {
    const testClient = { bla: 'a' };
    const hub = new Hub(testClient);
    const ndClient = { foo: 'bar' };
    hub.pushScope();
    hub.bindClient(ndClient);
    expect(hub.getStack()).toHaveLength(2);
    expect(hub.getStack()[0].client).toBe(testClient);
    expect(hub.getStack()[1].client).toBe(ndClient);
  });

  test('popScope', () => {
    const hub = new Hub();
    hub.pushScope();
    expect(hub.getStack()).toHaveLength(2);
    hub.popScope();
    expect(hub.getStack()).toHaveLength(1);
  });

  test('withScope', () => {
    const hub = new Hub();
    hub.withScope(() => {
      expect(hub.getStack()).toHaveLength(2);
    });
    expect(hub.getStack()).toHaveLength(1);
  });

  test('withScope bindClient', () => {
    const hub = new Hub();
    const testClient = { bla: 'a' };
    hub.withScope(() => {
      hub.bindClient(testClient);
      expect(hub.getStack()).toHaveLength(2);
      expect(hub.getStack()[1].client).toBe(testClient);
    });
    expect(hub.getStack()).toHaveLength(1);
  });

  test('withScope bindClient scope changes', () => {
    jest.useFakeTimers();
    const hub = new Hub();
    const storeScope = jest.fn();
    const testClient = {
      bla: 'a',
      getBackend: () => ({ storeScope }),
    };
    hub.withScope(() => {
      hub.bindClient(testClient);
      hub.configureScope(localScope => {
        localScope.setExtra('a', 'b');
      });
      jest.runAllTimers();
      expect(hub.getStack()).toHaveLength(2);
      expect(hub.getStack()[1].client).toBe(testClient);
      expect(storeScope.mock.calls).toHaveLength(1);
      expect(storeScope.mock.calls[0][0].extra).toEqual({ a: 'b' });
    });
    expect(hub.getStack()).toHaveLength(1);
  });

  test('withScope bindClient scope changes without configureScope', () => {
    jest.useFakeTimers();
    const hub = new Hub();
    const storeScope = jest.fn();
    const testClient = {
      bla: 'a',
      getBackend: () => ({ storeScope }),
    };
    hub.withScope(localScope => {
      hub.bindClient(testClient);
      localScope.setExtra('a', 'b');
      jest.runAllTimers();
      expect(hub.getStack()).toHaveLength(2);
      expect(hub.getStack()[1].client).toBe(testClient);
      expect(storeScope.mock.calls).toHaveLength(1);
      expect(storeScope.mock.calls[0][0].extra).toEqual({ a: 'b' });
    });
    expect(hub.getStack()).toHaveLength(1);
  });

  test('getCurrentClient', () => {
    const testClient = { bla: 'a' };
    const hub = new Hub(testClient);
    expect(hub.getClient()).toBe(testClient);
  });

  test('getStack', () => {
    const client = { a: 'b' };
    const hub = new Hub(client);
    expect(hub.getStack()[0].client).toBe(client);
  });

  test('getStackTop', () => {
    const testClient = { bla: 'a' };
    const hub = new Hub();
    hub.pushScope();
    hub.pushScope();
    hub.bindClient(testClient);
    expect(hub.getStackTop().client).toEqual({ bla: 'a' });
  });

  test('captureException', () => {
    const hub = new Hub();
    const spy = jest.spyOn(hub as any, 'invokeClient');
    hub.captureException('a');
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toBe('captureException');
    expect(spy.mock.calls[0][1]).toBe('a');
  });

  test('captureMessage', () => {
    const hub = new Hub();
    const spy = jest.spyOn(hub as any, 'invokeClient');
    hub.captureMessage('a');
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toBe('captureMessage');
    expect(spy.mock.calls[0][1]).toBe('a');
  });

  test('captureEvent', () => {
    const event: SentryEvent = {
      extra: { b: 3 },
    };
    const hub = new Hub();
    const spy = jest.spyOn(hub as any, 'invokeClient');
    hub.captureEvent(event);
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toBe('captureEvent');
    expect(spy.mock.calls[0][1]).toBe(event);
  });

  test('addBreadcrumb', () => {
    const hub = new Hub();
    const spy = jest.spyOn(hub as any, 'invokeClient');
    hub.addBreadcrumb({ message: 'test' });
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toBe('addBreadcrumb');
    expect(spy.mock.calls[0][1]).toEqual({ message: 'test' });
  });

  test('configureScope', () => {
    expect.assertions(0);
    const hub = new Hub();
    hub.configureScope(_ => {
      expect(true).toBeFalsy();
    });
  });

  test('configureScope', () => {
    expect.assertions(1);
    const localScope = new Scope();
    localScope.setExtra('a', 'b');
    const hub = new Hub({ a: 'b' }, localScope);
    hub.configureScope(confScope => {
      expect((confScope as any).extra).toEqual({ a: 'b' });
    });
  });

  test('pushScope inherit processors', () => {
    expect.assertions(1);
    const event: SentryEvent = {
      extra: { b: 3 },
    };
    const localScope = new Scope();
    localScope.setExtra('a', 'b');
    const hub = new Hub({ a: 'b' }, localScope);

    localScope.addEventProcessor(async (processedEvent: SentryEvent) => {
      processedEvent.dist = '1';
      return processedEvent;
    });

    hub.pushScope();
    const pushedScope = hub.getStackTop().scope;

    return pushedScope!.applyToEvent(event).then(final => {
      expect(final!.dist).toEqual('1');
    });
  });

  test('captureException should set event_id in hint', () => {
    const hub = new Hub();
    const spy = jest.spyOn(hub as any, 'invokeClient');
    hub.captureException('a');
    expect(spy.mock.calls[0][2].event_id).toBeTruthy();
  });

  test('captureMessage should set event_id in hint', () => {
    const hub = new Hub();
    const spy = jest.spyOn(hub as any, 'invokeClient');
    hub.captureMessage('a');
    expect(spy.mock.calls[0][3].event_id).toBeTruthy();
  });

  test('captureEvent should set event_id in hint', () => {
    const event: SentryEvent = {
      extra: { b: 3 },
    };
    const hub = new Hub();
    const spy = jest.spyOn(hub as any, 'invokeClient');
    hub.captureEvent(event);
    expect(spy.mock.calls[0][2].event_id).toBeTruthy();
  });

  test('lastEventId should be the same as last created', () => {
    const event: SentryEvent = {
      extra: { b: 3 },
    };
    const hub = new Hub();
    const eventId = hub.captureEvent(event);
    expect(eventId).toBe(hub.lastEventId());
  });

  test('run', () => {
    const currentHub = getCurrentHub();
    const myScope = new Scope();
    const myClient = { a: 'b' };
    myScope.setExtra('a', 'b');
    const myHub = new Hub(myClient, myScope);
    myHub.run(hub => {
      expect(hub.getScope()).toBe(myScope);
      expect(hub.getClient()).toBe(myClient);
      expect(hub).toBe(getCurrentHub());
    });
    expect(currentHub).toBe(getCurrentHub());
  });
});
