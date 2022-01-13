import { Event } from '@sentry/types';

import {
  _invokeClient,
  addBreadcrumb,
  bindClient,
  captureEvent,
  captureException,
  captureMessage,
  configureScope,
  getClient,
  getCurrentHub,
  getScope,
  getStack,
  getStackTop,
  Hub,
  isOlderThan,
  lastEventId,
  popScope,
  pushScope,
  run,
  withScope,
} from '../src/hub';
import { addScopeBreadcrumb, addScopeEventProcessor, applyScopeToEvent, Scope, setScopeExtra } from '../src/scope';

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
  };
}

describe('Hub', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('call bindClient with provided client when constructing new instance', () => {
    const testClient = makeClient();
    const hub = new Hub(testClient);
    expect(getStackTop(hub).client).toBe(testClient);
  });

  test('push process into stack', () => {
    const hub = new Hub();
    expect(getStack(hub)).toHaveLength(1);
  });

  test('pass in filled layer', () => {
    const hub = new Hub(clientFn);
    expect(getStack(hub)).toHaveLength(1);
  });

  test("don't invoke client sync with wrong func", () => {
    const hub = new Hub(clientFn);
    // @ts-ignore we want to able to call private method
    _invokeClient(hub, 'funca', true);
    expect(clientFn).not.toHaveBeenCalled();
  });

  test('isOlderThan', () => {
    const hub = new Hub();
    expect(isOlderThan(hub, 0)).toBeFalsy();
  });

  describe('pushScope', () => {
    test('simple', () => {
      const localScope = new Scope();
      setScopeExtra(localScope, 'a', 'b');
      const hub = new Hub(undefined, localScope);
      pushScope(hub);
      expect(getStack(hub)).toHaveLength(2);
      expect(getStack(hub)[1].scope).not.toBe(localScope);
      expect((getStack(hub)[1].scope as Scope).extra).toEqual({ a: 'b' });
    });

    test('inherit client', () => {
      const testClient: any = { bla: 'a' };
      const hub = new Hub(testClient);
      pushScope(hub);
      expect(getStack(hub)).toHaveLength(2);
      expect(getStack(hub)[1].client).toBe(testClient);
    });

    describe('bindClient', () => {
      test('should override current client', () => {
        const testClient = makeClient();
        const nextClient = makeClient();
        const hub = new Hub(testClient);
        bindClient(hub, nextClient);
        expect(getStack(hub)).toHaveLength(1);
        expect(getStack(hub)[0].client).toBe(nextClient);
      });

      test('should bind client to the top-most layer', () => {
        const testClient: any = { bla: 'a' };
        const nextClient: any = { foo: 'bar' };
        const hub = new Hub(testClient);
        pushScope(hub);
        bindClient(hub, nextClient);
        expect(getStack(hub)).toHaveLength(2);
        expect(getStack(hub)[0].client).toBe(testClient);
        expect(getStack(hub)[1].client).toBe(nextClient);
      });

      test('should call setupIntegration method of passed client', () => {
        const testClient = makeClient();
        const nextClient = makeClient();
        const hub = new Hub(testClient);
        bindClient(hub, nextClient);
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
      setScopeExtra(localScope, 'a', 'b');
      const hub = new Hub({ a: 'b' } as any, localScope);

      addScopeEventProcessor(localScope, async (processedEvent: Event) => {
        processedEvent.dist = '1';
        return processedEvent;
      });

      pushScope(hub);
      const pushedScope = getStackTop(hub).scope;

      return applyScopeToEvent(pushedScope!, event).then(final => {
        expect(final!.dist).toEqual('1');
      });
    });
  });

  test('popScope', () => {
    const hub = new Hub();
    pushScope(hub);
    expect(getStack(hub)).toHaveLength(2);
    popScope(hub);
    expect(getStack(hub)).toHaveLength(1);
  });

  describe('withScope', () => {
    let hub: Hub;

    beforeEach(() => {
      hub = new Hub();
    });

    test('simple', () => {
      withScope(hub, () => {
        expect(getStack(hub)).toHaveLength(2);
      });
      expect(getStack(hub)).toHaveLength(1);
    });

    test('bindClient', () => {
      const testClient: any = { bla: 'a' };
      withScope(hub, () => {
        bindClient(hub, testClient);
        expect(getStack(hub)).toHaveLength(2);
        expect(getStack(hub)[1].client).toBe(testClient);
      });
      expect(getStack(hub)).toHaveLength(1);
    });

    test('should bubble up exceptions', () => {
      const error = new Error('test');
      expect(() => {
        withScope(hub, () => {
          throw error;
        });
      }).toThrow(error);
    });
  });

  test('getCurrentClient', () => {
    const testClient: any = { bla: 'a' };
    const hub = new Hub(testClient);
    expect(getClient(hub)).toBe(testClient);
  });

  test('getStack', () => {
    const client: any = { a: 'b' };
    const hub = new Hub(client);
    expect(getStack(hub)[0].client).toBe(client);
  });

  test('getStackTop', () => {
    const testClient: any = { bla: 'a' };
    const hub = new Hub();
    pushScope(hub);
    pushScope(hub);
    bindClient(hub, testClient);
    expect(getStackTop(hub).client).toEqual({ bla: 'a' });
  });

  describe('configureScope', () => {
    test('should have an access to provide scope', () => {
      const localScope = new Scope();
      setScopeExtra(localScope, 'a', 'b');
      const hub = new Hub({} as any, localScope);
      const cb = jest.fn();
      configureScope(hub, cb);
      expect(cb).toHaveBeenCalledWith(localScope);
    });

    test('should not invoke without client and scope', () => {
      const hub = new Hub();
      const cb = jest.fn();
      configureScope(hub, cb);
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('captureException', () => {
    test('simple', () => {
      const testClient = makeClient();
      const hub = new Hub(testClient);
      captureException(hub, 'a');
      expect(testClient.captureException).toHaveBeenCalled();
      expect(testClient.captureException.mock.calls[0][0]).toBe('a');
    });

    test('should set event_id in hint', () => {
      const testClient = makeClient();
      const hub = new Hub(testClient);
      captureException(hub, 'a');
      expect(testClient.captureException.mock.calls[0][1].event_id).toBeTruthy();
    });

    test('should generate hint if not provided in the call', () => {
      const testClient = makeClient();
      const hub = new Hub(testClient);
      const ex = new Error('foo');
      captureException(hub, ex);
      expect(testClient.captureException.mock.calls[0][1].originalException).toBe(ex);
      expect(testClient.captureException.mock.calls[0][1].syntheticException).toBeInstanceOf(Error);
      expect(testClient.captureException.mock.calls[0][1].syntheticException.message).toBe('Sentry syntheticException');
    });
  });

  describe('captureMessage', () => {
    test('simple', () => {
      const testClient = makeClient();
      const hub = new Hub(testClient);
      captureMessage(hub, 'a');
      expect(testClient.captureMessage).toHaveBeenCalled();
      expect(testClient.captureMessage.mock.calls[0][0]).toBe('a');
    });

    test('should set event_id in hint', () => {
      const testClient = makeClient();
      const hub = new Hub(testClient);
      captureMessage(hub, 'a');
      expect(testClient.captureMessage.mock.calls[0][2].event_id).toBeTruthy();
    });

    test('should generate hint if not provided in the call', () => {
      const testClient = makeClient();
      const hub = new Hub(testClient);
      captureMessage(hub, 'foo');
      expect(testClient.captureMessage.mock.calls[0][2].originalException).toBe('foo');
      expect(testClient.captureMessage.mock.calls[0][2].syntheticException).toBeInstanceOf(Error);
      expect(testClient.captureMessage.mock.calls[0][2].syntheticException.message).toBe('foo');
    });
  });

  describe('captureEvent', () => {
    test('simple', () => {
      const testClient = makeClient();
      const event: Event = {
        extra: { b: 3 },
      };
      const hub = new Hub(testClient);
      captureEvent(hub, event);
      expect(testClient.captureEvent).toHaveBeenCalled();
      expect(testClient.captureEvent.mock.calls[0][0]).toBe(event);
    });

    test('should set event_id in hint', () => {
      const testClient = makeClient();
      const event: Event = {
        extra: { b: 3 },
      };
      const hub = new Hub(testClient);
      captureEvent(hub, event);
      expect(testClient.captureEvent.mock.calls[0][1].event_id).toBeTruthy();
    });

    test('sets lastEventId', () => {
      const testClient = makeClient();
      const event: Event = {
        extra: { b: 3 },
      };
      const hub = new Hub(testClient);
      captureEvent(hub, event);
      expect(testClient.captureEvent.mock.calls[0][1].event_id).toEqual(lastEventId(hub));
    });

    test('transactions do not set lastEventId', () => {
      const testClient = makeClient();
      const event: Event = {
        extra: { b: 3 },
        type: 'transaction',
      };
      const hub = new Hub(testClient);
      captureEvent(hub, event);
      expect(testClient.captureEvent.mock.calls[0][1].event_id).not.toEqual(lastEventId(hub));
    });
  });

  test('lastEventId should be the same as last created', () => {
    const event: Event = {
      extra: { b: 3 },
    };
    const hub = new Hub();
    const eventId = captureEvent(hub, event);
    expect(eventId).toBe(lastEventId(hub));
  });

  describe('run', () => {
    test('simple', () => {
      const currentHub = getCurrentHub();
      const myScope = new Scope();
      const myClient: any = { a: 'b' };
      setScopeExtra(myScope, 'a', 'b');
      const myHub = new Hub(myClient, myScope);
      run(myHub, hub => {
        expect(getScope(hub)).toBe(myScope);
        expect(getClient(hub)).toBe(myClient);
        expect(hub).toBe(getCurrentHub());
      });
      expect(currentHub).toBe(getCurrentHub());
    });

    test('should bubble up exceptions', () => {
      const hub = new Hub();
      const error = new Error('test');
      expect(() => {
        run(hub, () => {
          throw error;
        });
      }).toThrow(error);
    });
  });

  describe('breadcrumbs', () => {
    test('withScope', () => {
      expect.assertions(6);
      const hub = new Hub(clientFn);
      addBreadcrumb(hub, { message: 'My Breadcrumb' });
      withScope(hub, scope => {
        addScopeBreadcrumb(scope, { message: 'scope breadcrumb' });
        const event: Event = {};
        void applyScopeToEvent(scope, event)
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
