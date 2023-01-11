/* eslint-disable deprecation/deprecation */

import type { Scope } from '../src';
import {
  captureEvent,
  captureException,
  captureMessage,
  configureScope,
  getCurrentHub,
  getHubFromCarrier,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  withScope,
} from '../src';

export class TestClient {
  public static instance?: TestClient;

  public constructor(public options: Record<string, unknown>) {
    TestClient.instance = this;
  }

  public mySecretPublicMethod(str: string): string {
    return `secret: ${str}`;
  }
}

export class TestClient2 {}

export function init(options: Record<string, unknown>): void {
  getCurrentHub().bindClient(new TestClient(options) as any);
}

// eslint-disable-next-line no-var
declare var global: any;

describe('Top Level API', () => {
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

    test('Exception with explicit scope', () => {
      const client: any = {
        captureException: jest.fn(async () => Promise.resolve()),
      };
      getCurrentHub().withScope(() => {
        getCurrentHub().bindClient(client);
        const e = new Error('test exception');
        const captureContext = { extra: { foo: 'wat' } };
        captureException(e, captureContext);
        expect(client.captureException.mock.calls[0][0]).toBe(e);
        expect(client.captureException.mock.calls[0][1].captureContext).toBe(captureContext);
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

    test('Message with explicit scope', () => {
      const client: any = { captureMessage: jest.fn(async () => Promise.resolve()) };
      getCurrentHub().withScope(() => {
        getCurrentHub().bindClient(client);
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
    // TODO: Before we release v8, check if this is still a thing
    test('Message with custom level', () => {
      const client: any = { captureMessage: jest.fn(async () => Promise.resolve()) };
      getCurrentHub().withScope(() => {
        getCurrentHub().bindClient(client);
        const message = 'yo';
        const level = 'warning';
        captureMessage(message, level);
        expect(client.captureMessage.mock.calls[0][0]).toBe(message);
        expect(client.captureMessage.mock.calls[0][1]).toBe('warning');
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
      expect(global.__SENTRY__.hub._stack[1].scope._user).toEqual({
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
      expect(global.__SENTRY__.hub._stack[1].scope._extra).toEqual({
        id: '1234',
      });
      getCurrentHub().popScope();
    });

    test('Tags Context', () => {
      init({});
      configureScope((scope: Scope) => {
        scope.setTag('id', '1234');
      });
      expect(global.__SENTRY__.hub._stack[0].scope._tags).toEqual({
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
      expect(global.__SENTRY__.hub._stack[1].scope._fingerprint).toEqual(['abcd']);
    });

    test('Level', () => {
      const client: any = new TestClient({});
      const scope = getCurrentHub().pushScope();
      getCurrentHub().bindClient(client);
      scope.setLevel('warning');
      expect(global.__SENTRY__.hub._stack[1].scope._level).toEqual('warning');
    });
  });

  test('Clear Scope', () => {
    const client: any = new TestClient({});
    getCurrentHub().withScope(() => {
      getCurrentHub().bindClient(client);
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

  test('returns undefined before binding a client', () => {
    expect(getCurrentHub().getClient()).toBeUndefined();
  });

  test('returns the bound client', () => {
    init({});
    expect(getCurrentHub().getClient()).toBe(TestClient.instance);
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
    expect((iAmSomeGlobalVarTheUserHasToManage.state as any).__SENTRY__.hub._stack[1].scope._user).toEqual({
      id: '1234',
    });
    hub.popScope();
    expect((iAmSomeGlobalVarTheUserHasToManage.state as any).__SENTRY__.hub._stack[1]).toBeUndefined();
  });

  test('withScope', () => {
    withScope(scope => {
      scope.setLevel('warning');
      scope.setFingerprint(['1']);
      withScope(scope2 => {
        scope2.setLevel('info');
        scope2.setFingerprint(['2']);
        withScope(scope3 => {
          scope3.clear();
          expect(global.__SENTRY__.hub._stack[1].scope._level).toEqual('warning');
          expect(global.__SENTRY__.hub._stack[1].scope._fingerprint).toEqual(['1']);
          expect(global.__SENTRY__.hub._stack[2].scope._level).toEqual('info');
          expect(global.__SENTRY__.hub._stack[2].scope._fingerprint).toEqual(['2']);
          expect(global.__SENTRY__.hub._stack[3].scope._level).toBeUndefined();
        });
        expect(global.__SENTRY__.hub._stack).toHaveLength(3);
      });
      expect(global.__SENTRY__.hub._stack).toHaveLength(2);
    });
    expect(global.__SENTRY__.hub._stack).toHaveLength(1);
  });

  test('setExtras', () => {
    init({});
    setExtras({ a: 'b' });
    expect(global.__SENTRY__.hub._stack[0].scope._extra).toEqual({ a: 'b' });
  });

  test('setTags', () => {
    init({});
    setTags({ a: 'b' });
    expect(global.__SENTRY__.hub._stack[0].scope._tags).toEqual({ a: 'b' });
  });

  test('setExtra', () => {
    init({});
    setExtra('a', 'b');
    // prettier-ignore
    expect(global.__SENTRY__.hub._stack[0].scope._extra).toEqual({ 'a': 'b' });
  });

  test('setTag', () => {
    init({});
    setTag('a', 'b');
    // prettier-ignore
    expect(global.__SENTRY__.hub._stack[0].scope._tags).toEqual({ 'a': 'b' });
  });

  test('setUser', () => {
    init({});
    setUser({ id: 'b' });
    expect(global.__SENTRY__.hub._stack[0].scope._user).toEqual({ id: 'b' });
  });

  test('setContext', () => {
    init({});
    setContext('test', { id: 'b' });
    expect(global.__SENTRY__.hub._stack[0].scope._contexts).toEqual({ test: { id: 'b' } });
  });
});
