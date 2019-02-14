import { getCurrentHub, getHubFromCarrier, Scope } from '@sentry/hub';
import { Severity } from '@sentry/types';
import { _callOnClient, captureEvent, captureException, captureMessage, configureScope, withScope } from '../../src';
import { init, TestClient, TestClient2 } from '../mocks/client';

declare var global: any;

describe('Minimal', () => {
  beforeEach(() => {
    global.__SENTRY__ = {
      hub: undefined,
    };
  });

  describe('Capture', () => {
    test('Return an event_id', () => {
      const client: any = {
        captureException: jest.fn(async () => Promise.resolve()),
      };
      getCurrentHub().withScope(() => {
        getCurrentHub().bindClient(client);
        const e = new Error('test exception');
        const eventId = captureException(e);
        expect(eventId).toBeTruthy();
      });
    });

    test('Exception', () => {
      const client: any = {
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
      const client: any = { captureMessage: jest.fn(async () => Promise.resolve()) };
      getCurrentHub().withScope(() => {
        getCurrentHub().bindClient(client);
        const message = 'yo';
        captureMessage(message);
        expect(client.captureMessage.mock.calls[0][0]).toBe(message);
      });
    });

    test('Event', () => {
      const client: any = { captureEvent: jest.fn(async () => Promise.resolve()) };
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
      const client: any = new TestClient({});
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
      const client: any = new TestClient({});
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
      const client: any = new TestClient({});
      getCurrentHub().pushScope();
      getCurrentHub().bindClient(client);
      configureScope((scope: Scope) => {
        scope.setFingerprint(['abcd']);
      });
      expect(global.__SENTRY__.hub.stack[1].scope.fingerprint).toEqual(['abcd']);
    });

    test('Level', () => {
      const client: any = new TestClient({});
      const scope = getCurrentHub().pushScope();
      getCurrentHub().bindClient(client);
      scope.setLevel(Severity.Warning);
      expect(global.__SENTRY__.hub.stack[1].scope.level).toEqual(Severity.Warning);
    });
  });

  test('Clear Scope', () => {
    const client: any = new TestClient({});
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
      getCurrentHub().bindClient(new TestClient({}) as any);
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
        getCurrentHub().bindClient(new TestClient2() as any);
      });
    }).not.toThrow();
  });

  test('does not throw an error when pushing same clients', () => {
    init({});
    expect(() => {
      getCurrentHub().withScope(() => {
        getCurrentHub().bindClient(new TestClient({}) as any);
      });
    }).not.toThrow();
  });

  test('custom carrier', () => {
    const iAmSomeGlobalVarTheUserHasToManage = {
      state: {},
    };
    const hub = getHubFromCarrier(iAmSomeGlobalVarTheUserHasToManage.state);
    hub.pushScope();
    hub.bindClient(new TestClient({}) as any);
    hub.configureScope((scope: Scope) => {
      scope.setUser({ id: '1234' });
    });
    expect((iAmSomeGlobalVarTheUserHasToManage.state as any).__SENTRY__.hub.stack[1].scope.user).toEqual({
      id: '1234',
    });
    hub.popScope();
    expect((iAmSomeGlobalVarTheUserHasToManage.state as any).__SENTRY__.hub.stack[1]).toBeUndefined();
  });

  test('withScope', () => {
    withScope(scope => {
      scope.setLevel(Severity.Warning);
      scope.setFingerprint(['1']);
      withScope(scope2 => {
        scope2.setLevel(Severity.Info);
        scope2.setFingerprint(['2']);
        withScope(scope3 => {
          scope3.clear();
          expect(global.__SENTRY__.hub.stack[1].scope.level).toEqual(Severity.Warning);
          expect(global.__SENTRY__.hub.stack[1].scope.fingerprint).toEqual(['1']);
          expect(global.__SENTRY__.hub.stack[2].scope.level).toEqual(Severity.Info);
          expect(global.__SENTRY__.hub.stack[2].scope.fingerprint).toEqual(['2']);
          expect(global.__SENTRY__.hub.stack[3].scope.level).toBeUndefined();
        });
        expect(global.__SENTRY__.hub.stack).toHaveLength(3);
      });
      expect(global.__SENTRY__.hub.stack).toHaveLength(2);
    });
    expect(global.__SENTRY__.hub.stack).toHaveLength(1);
  });
});
