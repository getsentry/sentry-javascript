import { getCurrentHub, getHubFromCarrier, Scope } from '@sentry/hub';
import {
  _callOnClient,
  addBreadcrumb,
  captureEvent,
  captureException,
  captureMessage,
  configureScope,
} from '../../src';
import { init, TestClient, TestClient2 } from '../mocks/client';

declare var global: any;

describe('Minimal', () => {
  beforeEach(() => {
    global.__SENTRY__ = {
      hub: undefined,
    };
  });

  describe('Capture', () => {
    test('Exception', () => {
      const client = {
        captureException: jest.fn(async () => Promise.resolve()),
      };
      getCurrentHub().withScope(() => {
        getCurrentHub().bindClient(client);
        const e = new Error('test exception');
        captureException(e);
        expect(client.captureException.mock.calls[0][0]).toBe(e);
      });
    });

    test('Message', () => {
      const client = { captureMessage: jest.fn(async () => Promise.resolve()) };
      getCurrentHub().withScope(() => {
        getCurrentHub().bindClient(client);
        const message = 'yo';
        captureMessage(message);
        expect(client.captureMessage.mock.calls[0][0]).toBe(message);
      });
    });

    test('Event', () => {
      const client = { captureEvent: jest.fn(async () => Promise.resolve()) };
      getCurrentHub().withScope(() => {
        getCurrentHub().bindClient(client);
        const e = { message: 'test' };
        captureEvent(e);
        expect(client.captureEvent.mock.calls[0][0]).toBe(e);
      });
    });
  });

  describe('configureScope', () => {
    test('User Context', () => {
      const client = new TestClient({});
      getCurrentHub().pushScope();
      getCurrentHub().bindClient(client);
      configureScope((scope: Scope) => {
        scope.setUser({ id: '1234' });
      });
      expect(global.__SENTRY__.hub.stack[1].scope.user).toEqual({
        id: '1234',
      });
      getCurrentHub().popScope();
    });

    test('Extra Context', () => {
      const client = new TestClient({});
      getCurrentHub().pushScope();
      getCurrentHub().bindClient(client);
      configureScope((scope: Scope) => {
        scope.setExtra('id', '1234');
      });
      expect(global.__SENTRY__.hub.stack[1].scope.extra).toEqual({
        id: '1234',
      });
      getCurrentHub().popScope();
    });

    test('Tags Context', () => {
      init({});
      configureScope((scope: Scope) => {
        scope.setTag('id', '1234');
      });
      expect(global.__SENTRY__.hub.stack[0].scope.tags).toEqual({
        id: '1234',
      });
    });

    test('Fingerprint', () => {
      const client = new TestClient({});
      getCurrentHub().pushScope();
      getCurrentHub().bindClient(client);
      configureScope((scope: Scope) => {
        scope.setFingerprint(['abcd']);
      });
      expect(global.__SENTRY__.hub.stack[1].scope.fingerprint).toEqual(['abcd']);
    });
  });

  test('Clear Scope', () => {
    const client = new TestClient({});
    getCurrentHub().withScope(() => {
      getCurrentHub().bindClient(client);
      expect(global.__SENTRY__.hub.stack.length).toBe(2);
      configureScope((scope: Scope) => {
        scope.setUser({ id: '1234' });
      });
      expect(global.__SENTRY__.hub.stack[1].scope.user).toEqual({
        id: '1234',
      });
      configureScope((scope: Scope) => {
        scope.clear();
      });
      expect(global.__SENTRY__.hub.stack[1].scope.user).toEqual({});
    });
  });

  test('Add Breadcrumb', () => {
    const client = {
      addBreadcrumb: jest.fn(),
    };
    getCurrentHub().pushScope();
    getCurrentHub().bindClient(client);
    addBreadcrumb({ message: 'world' });
    expect(client.addBreadcrumb.mock.calls[0][0]).toEqual({
      message: 'world',
    });
    getCurrentHub().popScope();
  });

  test('returns undefined before binding a client', () => {
    expect(getCurrentHub().getClient()).toBeUndefined();
  });

  test('returns the bound client', () => {
    init({});
    expect(getCurrentHub().getClient()).toBe(TestClient.instance);
  });

  test('Calls function on the client', done => {
    const s = jest.spyOn(TestClient.prototype, 'mySecretPublicMethod');
    getCurrentHub().withScope(() => {
      getCurrentHub().bindClient(new TestClient({}));
      _callOnClient('mySecretPublicMethod', 'test');
      expect(s.mock.calls[0][0]).toBe('test');
      s.mockRestore();
      done();
    });
  });

  test('does not throw an error when pushing different clients', () => {
    init({});
    expect(() => {
      getCurrentHub().withScope(() => {
        getCurrentHub().bindClient(new TestClient2());
      });
    }).not.toThrow();
  });

  test('does not throw an error when pushing same clients', () => {
    init({});
    expect(() => {
      getCurrentHub().withScope(() => {
        getCurrentHub().bindClient(new TestClient({}));
      });
    }).not.toThrow();
  });

  test('custom carrier', () => {
    const iAmSomeGlobalVarTheUserHasToManage = {
      state: {},
    };
    const hub = getHubFromCarrier(iAmSomeGlobalVarTheUserHasToManage.state);
    hub.pushScope();
    hub.bindClient(new TestClient({}));
    hub.configureScope((scope: Scope) => {
      scope.setUser({ id: '1234' });
    });
    expect(((iAmSomeGlobalVarTheUserHasToManage.state as any).__SENTRY__.hub.stack[1] as any).scope.user).toEqual({
      id: '1234',
    });
    hub.popScope();
    expect((iAmSomeGlobalVarTheUserHasToManage.state as any).__SENTRY__.hub.stack[1]).toBeUndefined();
  });
});
