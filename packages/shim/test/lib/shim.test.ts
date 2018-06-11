import {
  _callOnClient,
  addBreadcrumb,
  captureEvent,
  captureException,
  captureMessage,
  configureScope,
  getCurrentClient,
  hubFromCarrier,
  Layer,
  popScope,
  pushScope,
  Scope,
  withScope,
} from '../../src';
import { init, TestClient, TestClient2 } from '../mocks/client';

declare var global: any;

describe('Shim', () => {
  beforeEach(() => {
    global.__SENTRY__ = {
      shim: undefined,
      stack: [],
    };
  });

  describe('Capture', () => {
    test('Exception', () => {
      const client = {
        captureException: jest.fn(async () => Promise.resolve()),
      };
      withScope(client, () => {
        const e = new Error('test exception');
        captureException(e);
        expect(client.captureException.mock.calls[0][0]).toBe(e);
      });
    });

    test('Message', () => {
      const client = { captureMessage: jest.fn(async () => Promise.resolve()) };
      withScope(client, () => {
        const message = 'yo';
        captureMessage(message);
        expect(client.captureMessage.mock.calls[0][0]).toBe(message);
      });
    });

    test('Event', () => {
      const client = { captureEvent: jest.fn(async () => Promise.resolve()) };
      withScope(client, () => {
        const e = { message: 'test' };
        captureEvent(e);
        expect(client.captureEvent.mock.calls[0][0]).toBe(e);
      });
    });
  });

  describe('configureScope', () => {
    test('User Context', () => {
      const client = new TestClient({});
      pushScope(client);
      configureScope((scope: Scope) => {
        scope.setUser({ id: '1234' });
      });
      expect(global.__SENTRY__.stack[1].scope.user).toEqual({
        id: '1234',
      });
      popScope();
    });

    test('Extra Context', () => {
      const client = new TestClient({});
      pushScope(client);
      configureScope((scope: Scope) => {
        scope.setExtra('id', '1234');
      });
      expect(global.__SENTRY__.stack[1].scope.extra).toEqual({
        id: '1234',
      });
      popScope();
    });

    test('Tags Context', () => {
      const client = new TestClient({});
      pushScope(client);
      configureScope((scope: Scope) => {
        scope.setTag('id', '1234');
      });
      expect(global.__SENTRY__.stack[1].scope.tags).toEqual({
        id: '1234',
      });
      popScope();
    });

    test('Fingerprint', () => {
      const client = new TestClient({});
      pushScope(client);
      configureScope((scope: Scope) => {
        scope.setFingerprint(['abcd']);
      });
      expect(global.__SENTRY__.stack[1].scope.fingerprint).toEqual(['abcd']);
    });
  });

  test('Clear Scope', () => {
    const client = new TestClient({});
    withScope(client, () => {
      expect(global.__SENTRY__.stack.length).toBe(2);
      configureScope((scope: Scope) => {
        scope.setUser({ id: '1234' });
      });
      expect(global.__SENTRY__.stack[1].scope.user).toEqual({
        id: '1234',
      });
      configureScope((scope: Scope) => {
        scope.clear();
      });
      expect(global.__SENTRY__.stack[1].scope.user).toEqual({});
    });
  });

  test('Add Breadcrumb', () => {
    const client = {
      addBreadcrumb: jest.fn(),
    };
    pushScope(client);
    addBreadcrumb({ message: 'world' });
    expect(client.addBreadcrumb.mock.calls[0][0]).toEqual({
      message: 'world',
    });
    popScope();
  });

  test('returns undefined before binding a client', () => {
    expect(getCurrentClient()).toBeUndefined();
  });

  test('returns the bound client', () => {
    init({});
    expect(getCurrentClient()).toBe(TestClient.instance);
  });

  test('Calls function on the client', done => {
    const s = jest.spyOn(TestClient.prototype, 'mySecretPublicMethod');
    withScope(new TestClient({}), () => {
      _callOnClient('mySecretPublicMethod', undefined, 'test');
      expect(s.mock.calls[0][0]).toBe('test');
      s.mockRestore();
      done();
    });
  });

  test('does not throw an error when pushing different clients', () => {
    init({});
    expect(() => {
      withScope(new TestClient2(), () => {
        //
      });
    }).not.toThrow();
  });

  test('does not throw an error when pushing same clients', () => {
    init({});
    expect(() => {
      withScope(new TestClient({}), () => {
        //
      });
    }).not.toThrow();
  });

  test.only('foo', () => {
    const iAmSomeGlobalVarTheUserHasToManage = {
      state: [],
    };
    const hub = hubFromCarrier(iAmSomeGlobalVarTheUserHasToManage.state);
    pushScope(new TestClient({}), hub);
    configureScope((scope: Scope) => {
      scope.setUser({ id: '1234' });
    }, hub);
    expect(
      (iAmSomeGlobalVarTheUserHasToManage.state[1] as any).scope.user,
    ).toEqual({ id: '1234' });
    popScope(hub);
    expect(iAmSomeGlobalVarTheUserHasToManage.state[1] as any).toBeUndefined();
  });
});
