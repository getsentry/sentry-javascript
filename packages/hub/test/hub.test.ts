import { Event } from '@sentry/types';

import {
  _invokeHubClient,
  addHubBreadcrumb,
  bindHubClient,
  captureHubEvent,
  captureHubException,
  captureHubMessage,
  configureHubScope,
  getHubClient,
  getCurrentHub,
  getHubScope,
  getHubStack,
  getHubStackTop,
  Hub,
  isOlderThan,
  getHubLastEventId,
  popHubScope,
  pushHubScope,
  run,
  withHubScope,
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
    expect(getHubStackTop(hub).client).toBe(testClient);
  });

  test('push process into stack', () => {
    const hub = new Hub();
    expect(getHubStack(hub)).toHaveLength(1);
  });

  test('pass in filled layer', () => {
    const hub = new Hub(clientFn);
    expect(getHubStack(hub)).toHaveLength(1);
  });

  test("don't invoke client sync with wrong func", () => {
    const hub = new Hub(clientFn);
    // @ts-ignore we want to able to call private method
    _invokeHubClient(hub, 'funca', true);
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
      pushHubScope(hub);
      expect(getHubStack(hub)).toHaveLength(2);
      expect(getHubStack(hub)[1].scope).not.toBe(localScope);
      expect((getHubStack(hub)[1].scope as Scope).extra).toEqual({ a: 'b' });
    });

    test('inherit client', () => {
      const testClient: any = { bla: 'a' };
      const hub = new Hub(testClient);
      pushHubScope(hub);
      expect(getHubStack(hub)).toHaveLength(2);
      expect(getHubStack(hub)[1].client).toBe(testClient);
    });

    describe('bindClient', () => {
      test('should override current client', () => {
        const testClient = makeClient();
        const nextClient = makeClient();
        const hub = new Hub(testClient);
        bindHubClient(hub, nextClient);
        expect(getHubStack(hub)).toHaveLength(1);
        expect(getHubStack(hub)[0].client).toBe(nextClient);
      });

      test('should bind client to the top-most layer', () => {
        const testClient: any = { bla: 'a' };
        const nextClient: any = { foo: 'bar' };
        const hub = new Hub(testClient);
        pushHubScope(hub);
        bindHubClient(hub, nextClient);
        expect(getHubStack(hub)).toHaveLength(2);
        expect(getHubStack(hub)[0].client).toBe(testClient);
        expect(getHubStack(hub)[1].client).toBe(nextClient);
      });

      test('should call setupIntegration method of passed client', () => {
        const testClient = makeClient();
        const nextClient = makeClient();
        const hub = new Hub(testClient);
        bindHubClient(hub, nextClient);
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

      pushHubScope(hub);
      const pushedScope = getHubStackTop(hub).scope;

      return applyScopeToEvent(pushedScope!, event).then(final => {
        expect(final!.dist).toEqual('1');
      });
    });
  });

  test('popScope', () => {
    const hub = new Hub();
    pushHubScope(hub);
    expect(getHubStack(hub)).toHaveLength(2);
    popHubScope(hub);
    expect(getHubStack(hub)).toHaveLength(1);
  });

  describe('withScope', () => {
    let hub: Hub;

    beforeEach(() => {
      hub = new Hub();
    });

    test('simple', () => {
      withHubScope(hub, () => {
        expect(getHubStack(hub)).toHaveLength(2);
      });
      expect(getHubStack(hub)).toHaveLength(1);
    });

    test('bindClient', () => {
      const testClient: any = { bla: 'a' };
      withHubScope(hub, () => {
        bindHubClient(hub, testClient);
        expect(getHubStack(hub)).toHaveLength(2);
        expect(getHubStack(hub)[1].client).toBe(testClient);
      });
      expect(getHubStack(hub)).toHaveLength(1);
    });

    test('should bubble up exceptions', () => {
      const error = new Error('test');
      expect(() => {
        withHubScope(hub, () => {
          throw error;
        });
      }).toThrow(error);
    });
  });

  test('getCurrentClient', () => {
    const testClient: any = { bla: 'a' };
    const hub = new Hub(testClient);
    expect(getHubClient(hub)).toBe(testClient);
  });

  test('getStack', () => {
    const client: any = { a: 'b' };
    const hub = new Hub(client);
    expect(getHubStack(hub)[0].client).toBe(client);
  });

  test('getStackTop', () => {
    const testClient: any = { bla: 'a' };
    const hub = new Hub();
    pushHubScope(hub);
    pushHubScope(hub);
    bindHubClient(hub, testClient);
    expect(getHubStackTop(hub).client).toEqual({ bla: 'a' });
  });

  describe('configureScope', () => {
    test('should have an access to provide scope', () => {
      const localScope = new Scope();
      setScopeExtra(localScope, 'a', 'b');
      const hub = new Hub({} as any, localScope);
      const cb = jest.fn();
      configureHubScope(hub, cb);
      expect(cb).toHaveBeenCalledWith(localScope);
    });

    test('should not invoke without client and scope', () => {
      const hub = new Hub();
      const cb = jest.fn();
      configureHubScope(hub, cb);
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('captureException', () => {
    test('simple', () => {
      const testClient = makeClient();
      const hub = new Hub(testClient);
      captureHubException(hub, 'a');
      expect(testClient.captureException).toHaveBeenCalled();
      expect(testClient.captureException.mock.calls[0][0]).toBe('a');
    });

    test('should set event_id in hint', () => {
      const testClient = makeClient();
      const hub = new Hub(testClient);
      captureHubException(hub, 'a');
      expect(testClient.captureException.mock.calls[0][1].event_id).toBeTruthy();
    });

    test('should generate hint if not provided in the call', () => {
      const testClient = makeClient();
      const hub = new Hub(testClient);
      const ex = new Error('foo');
      captureHubException(hub, ex);
      expect(testClient.captureException.mock.calls[0][1].originalException).toBe(ex);
      expect(testClient.captureException.mock.calls[0][1].syntheticException).toBeInstanceOf(Error);
      expect(testClient.captureException.mock.calls[0][1].syntheticException.message).toBe('Sentry syntheticException');
    });
  });

  describe('captureMessage', () => {
    test('simple', () => {
      const testClient = makeClient();
      const hub = new Hub(testClient);
      captureHubMessage(hub, 'a');
      expect(testClient.captureMessage).toHaveBeenCalled();
      expect(testClient.captureMessage.mock.calls[0][0]).toBe('a');
    });

    test('should set event_id in hint', () => {
      const testClient = makeClient();
      const hub = new Hub(testClient);
      captureHubMessage(hub, 'a');
      expect(testClient.captureMessage.mock.calls[0][2].event_id).toBeTruthy();
    });

    test('should generate hint if not provided in the call', () => {
      const testClient = makeClient();
      const hub = new Hub(testClient);
      captureHubMessage(hub, 'foo');
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
      captureHubEvent(hub, event);
      expect(testClient.captureEvent).toHaveBeenCalled();
      expect(testClient.captureEvent.mock.calls[0][0]).toBe(event);
    });

    test('should set event_id in hint', () => {
      const testClient = makeClient();
      const event: Event = {
        extra: { b: 3 },
      };
      const hub = new Hub(testClient);
      captureHubEvent(hub, event);
      expect(testClient.captureEvent.mock.calls[0][1].event_id).toBeTruthy();
    });

    test('sets lastEventId', () => {
      const testClient = makeClient();
      const event: Event = {
        extra: { b: 3 },
      };
      const hub = new Hub(testClient);
      captureHubEvent(hub, event);
      expect(testClient.captureEvent.mock.calls[0][1].event_id).toEqual(getHubLastEventId(hub));
    });

    test('transactions do not set lastEventId', () => {
      const testClient = makeClient();
      const event: Event = {
        extra: { b: 3 },
        type: 'transaction',
      };
      const hub = new Hub(testClient);
      captureHubEvent(hub, event);
      expect(testClient.captureEvent.mock.calls[0][1].event_id).not.toEqual(getHubLastEventId(hub));
    });
  });

  test('lastEventId should be the same as last created', () => {
    const event: Event = {
      extra: { b: 3 },
    };
    const hub = new Hub();
    const eventId = captureHubEvent(hub, event);
    expect(eventId).toBe(getHubLastEventId(hub));
  });

  describe('run', () => {
    test('simple', () => {
      const currentHub = getCurrentHub();
      const myScope = new Scope();
      const myClient: any = { a: 'b' };
      setScopeExtra(myScope, 'a', 'b');
      const myHub = new Hub(myClient, myScope);
      run(myHub, hub => {
        expect(getHubScope(hub)).toBe(myScope);
        expect(getHubClient(hub)).toBe(myClient);
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
      addHubBreadcrumb(hub, { message: 'My Breadcrumb' });
      withHubScope(hub, scope => {
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
