import { getCurrentHub, getHubFromCarrier, Scope } from '@sentry/hub';
import { Severity } from '@sentry/types';

import {
  _callOnClient,
  captureEvent,
  captureException,
  captureMessage,
  configureScope,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  withScope,
} from '../../src';
import { TestClient } from '../mocks/client';

// eslint-disable-next-line no-var
declare var global: any;

describe('Minimal', () => {
  let client: TestClient;

  beforeEach(() => {
    client = new TestClient();
    global.__SENTRY__ = {
      hub: undefined,
    };
  });

  test('works with custom carriers', () => {
    const iAmSomeGlobalVarTheUserHasToManage = {
      state: {},
    };
    const hub = getHubFromCarrier(iAmSomeGlobalVarTheUserHasToManage.state);
    hub.pushScope();
    hub.bindClient(client);
    hub.configureScope((scope: Scope) => {
      scope.setUser({ id: '1234' });
    });
    expect((iAmSomeGlobalVarTheUserHasToManage.state as any).__SENTRY__.hub._stack[1].scope._user).toEqual({
      id: '1234',
    });
    hub.popScope();
    expect((iAmSomeGlobalVarTheUserHasToManage.state as any).__SENTRY__.hub._stack[1]).toBeUndefined();
  });

  describe('bindClient', () => {
    test('bindClient returns undefined before binding a client', () => {
      expect(getCurrentHub().getClient()).toBeUndefined();
    });

    test('bindClient returns the bound client', () => {
      getCurrentHub().bindClient(client);
      expect(getCurrentHub().getClient()).toBe(client);
    });
  });

  describe('client methods', () => {
    beforeEach(() => {
      getCurrentHub().bindClient(client);
    });

    test('calls function on the client', done => {
      const s = jest.spyOn(TestClient.prototype, 'mySecretPublicMethod');
      getCurrentHub().withScope(() => {
        getCurrentHub().bindClient(client);
        _callOnClient('mySecretPublicMethod', 'test');
        expect(s.mock.calls[0][0]).toBe('test');
        s.mockRestore();
        done();
      });
    });

    test('captureException returns an event_id', () => {
      getCurrentHub().withScope(() => {
        const e = new Error('test exception');
        const eventId = captureException(e);
        expect(eventId).toBeTruthy();
      });
    });

    test('captureException', () => {
      getCurrentHub().withScope(() => {
        const e = new Error('test exception');
        captureException(e);
        expect(client.captureException.mock.calls[0][0]).toBe(e);
      });
    });

    test('captureException with explicit scope', () => {
      getCurrentHub().withScope(() => {
        const e = new Error('test exception');
        const captureContext = { extra: { foo: 'wat' } };
        captureException(e, captureContext);
        expect(client.captureException.mock.calls[0][0]).toBe(e);
        expect(client.captureException.mock.calls[0][1].captureContext).toBe(captureContext);
      });
    });

    test('captureMessage', () => {
      getCurrentHub().withScope(() => {
        const message = 'yo';
        captureMessage(message);
        expect(client.captureMessage.mock.calls[0][0]).toBe(message);
      });
    });

    test('captureMessage with explicit scope', () => {
      getCurrentHub().withScope(() => {
        const message = 'yo';
        const captureContext = { extra: { foo: 'wat' } };
        captureMessage(message, captureContext);
        expect(client.captureMessage.mock.calls[0][0]).toBe(message);
        // Skip the level if explicit content is provided
        expect(client.captureMessage.mock.calls[0][1]).toBe(undefined);
        expect(client.captureMessage.mock.calls[0][2].captureContext).toBe(captureContext);
      });
    });

    // NOTE: We left custom level as 2nd argument to not break the API. Should be removed and unified in v6.
    test('captureMessage with custom level', () => {
      getCurrentHub().withScope(() => {
        const message = 'yo';
        const level = Severity.Warning;
        captureMessage(message, level);
        expect(client.captureMessage.mock.calls[0][0]).toBe(message);
        expect(client.captureMessage.mock.calls[0][1]).toBe(Severity.Warning);
      });
    });

    test('captureEvent', () => {
      getCurrentHub().withScope(() => {
        const e = { message: 'test' };
        captureEvent(e);
        expect(client.captureEvent.mock.calls[0][0]).toBe(e);
      });
    });
  });

  describe('scope methods', () => {
    beforeEach(() => {
      getCurrentHub().bindClient(client);
    });

    describe('configureScope', () => {
      test('setUser', () => {
        getCurrentHub().pushScope();
        configureScope((scope: Scope) => {
          scope.setUser({ id: '1234' });
        });
        expect(global.__SENTRY__.hub._stack[1].scope._user).toEqual({
          id: '1234',
        });
        getCurrentHub().popScope();
      });

      test('setExtra', () => {
        getCurrentHub().pushScope();
        configureScope((scope: Scope) => {
          scope.setExtra('id', '1234');
        });
        expect(global.__SENTRY__.hub._stack[1].scope._extra).toEqual({
          id: '1234',
        });
        getCurrentHub().popScope();
      });

      test('setTag', () => {
        configureScope((scope: Scope) => {
          scope.setTag('id', '1234');
        });
        expect(global.__SENTRY__.hub._stack[0].scope._tags).toEqual({
          id: '1234',
        });
      });

      test('setFingerprint', () => {
        getCurrentHub().pushScope();
        configureScope((scope: Scope) => {
          scope.setFingerprint(['abcd']);
        });
        expect(global.__SENTRY__.hub._stack[1].scope._fingerprint).toEqual(['abcd']);
      });

      test('setLevel', () => {
        const scope = getCurrentHub().pushScope();
        scope.setLevel(Severity.Warning);
        expect(global.__SENTRY__.hub._stack[1].scope._level).toEqual(Severity.Warning);
      });
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
            expect(global.__SENTRY__.hub._stack[1].scope._level).toEqual(Severity.Warning);
            expect(global.__SENTRY__.hub._stack[1].scope._fingerprint).toEqual(['1']);
            expect(global.__SENTRY__.hub._stack[2].scope._level).toEqual(Severity.Info);
            expect(global.__SENTRY__.hub._stack[2].scope._fingerprint).toEqual(['2']);
            expect(global.__SENTRY__.hub._stack[3].scope._level).toBeUndefined();
          });
          expect(global.__SENTRY__.hub._stack).toHaveLength(3);
        });
        expect(global.__SENTRY__.hub._stack).toHaveLength(2);
      });
      expect(global.__SENTRY__.hub._stack).toHaveLength(1);
    });

    test('clear', () => {
      getCurrentHub().withScope(() => {
        expect(global.__SENTRY__.hub._stack.length).toBe(2);
        configureScope((scope: Scope) => {
          scope.setUser({ id: '1234' });
        });
        expect(global.__SENTRY__.hub._stack[1].scope._user).toEqual({
          id: '1234',
        });
        configureScope((scope: Scope) => {
          scope.clear();
        });
        expect(global.__SENTRY__.hub._stack[1].scope._user).toEqual({});
      });
    });

    test('setExtras', () => {
      setExtras({ a: 'b' });
      expect(global.__SENTRY__.hub._stack[0].scope._extra).toEqual({ a: 'b' });
    });

    test('setTags', () => {
      setTags({ a: 'b' });
      expect(global.__SENTRY__.hub._stack[0].scope._tags).toEqual({ a: 'b' });
    });

    test('setExtra', () => {
      setExtra('a', 'b');
      expect(global.__SENTRY__.hub._stack[0].scope._extra).toEqual({ a: 'b' });
    });

    test('setTag', () => {
      setTag('a', 'b');
      expect(global.__SENTRY__.hub._stack[0].scope._tags).toEqual({ a: 'b' });
    });

    test('setUser', () => {
      setUser({ id: 'b' });
      expect(global.__SENTRY__.hub._stack[0].scope._user).toEqual({ id: 'b' });
    });

    test('setContext', () => {
      setContext('test', { id: 'b' });
      expect(global.__SENTRY__.hub._stack[0].scope._contexts).toEqual({ test: { id: 'b' } });
    });
  });
});
