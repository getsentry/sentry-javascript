import {
  Hub,
  Scope,
  captureSession,
  endSession,
  getCurrentScope,
  getIsolationScope,
  makeMain,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  startSession,
  withIsolationScope,
  withScope,
} from '../../src';
import { TestClient, getDefaultTestClientOptions } from '../mocks/client';

function getTestClient(): TestClient {
  return new TestClient(
    getDefaultTestClientOptions({
      dsn: 'https://username@domain/123',
    }),
  );
}

describe('withScope', () => {
  beforeEach(() => {
    const client = getTestClient();
    const hub = new Hub(client);
    // eslint-disable-next-line deprecation/deprecation
    makeMain(hub);
  });

  it('works without a return value', () => {
    const scope1 = getCurrentScope();
    expect(scope1).toBeInstanceOf(Scope);

    scope1.setTag('foo', 'bar');

    const res = withScope(scope => {
      expect(scope).toBeInstanceOf(Scope);
      expect(scope).not.toBe(scope1);
      expect(scope['_tags']).toEqual({ foo: 'bar' });

      expect(getCurrentScope()).toBe(scope);
    });

    expect(getCurrentScope()).toBe(scope1);
    expect(res).toBe(undefined);
  });

  it('works with a return value', () => {
    const res = withScope(() => {
      return 'foo';
    });

    expect(res).toBe('foo');
  });

  it('works with an async function return value', async () => {
    const res = withScope(async () => {
      return 'foo';
    });

    expect(res).toBeInstanceOf(Promise);
    expect(await res).toBe('foo');
  });

  it('correctly sets & resets the current scope', () => {
    const scope1 = getCurrentScope();

    withScope(scope2 => {
      expect(scope2).not.toBe(scope1);
      expect(getCurrentScope()).toBe(scope2);
    });

    withScope(scope3 => {
      expect(scope3).not.toBe(scope1);
      expect(getCurrentScope()).toBe(scope3);
    });

    expect(getCurrentScope()).toBe(scope1);
  });

  it('correctly sets & resets the current scope with async functions', async () => {
    const scope1 = getCurrentScope();

    await withScope(async scope2 => {
      expect(scope2).not.toBe(scope1);
      expect(getCurrentScope()).toBe(scope2);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(getCurrentScope()).toBe(scope2);
    });

    await withScope(async scope3 => {
      expect(scope3).not.toBe(scope1);
      expect(getCurrentScope()).toBe(scope3);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(getCurrentScope()).toBe(scope3);
    });

    expect(getCurrentScope()).toBe(scope1);
  });

  it('correctly sets & resets the current scope when an error happens', () => {
    const scope1 = getCurrentScope();

    const error = new Error('foo');

    expect(() =>
      withScope(scope2 => {
        expect(scope2).not.toBe(scope1);
        expect(getCurrentScope()).toBe(scope2);

        throw error;
      }),
    ).toThrow(error);

    expect(getCurrentScope()).toBe(scope1);
  });

  it('correctly sets & resets the current scope with async functions & errors', async () => {
    const scope1 = getCurrentScope();

    const error = new Error('foo');

    await expect(
      withScope(async scope2 => {
        expect(scope2).not.toBe(scope1);
        expect(getCurrentScope()).toBe(scope2);

        throw error;
      }),
    ).rejects.toBe(error);

    expect(getCurrentScope()).toBe(scope1);
  });

  it('allows to pass a custom scope', () => {
    const scope1 = getCurrentScope();
    scope1.setExtra('x1', 'x1');

    const customScope = new Scope();
    customScope.setExtra('x2', 'x2');

    withScope(customScope, scope2 => {
      expect(scope2).not.toBe(scope1);
      expect(scope2).toBe(customScope);
      expect(getCurrentScope()).toBe(scope2);
      expect(scope2['_extra']).toEqual({ x2: 'x2' });
    });

    withScope(customScope, scope3 => {
      expect(scope3).not.toBe(scope1);
      expect(scope3).toBe(customScope);
      expect(getCurrentScope()).toBe(scope3);
      expect(scope3['_extra']).toEqual({ x2: 'x2' });
    });

    expect(getCurrentScope()).toBe(scope1);
  });
});

describe('session APIs', () => {
  beforeEach(() => {
    const client = getTestClient();
    const hub = new Hub(client);
    // eslint-disable-next-line deprecation/deprecation
    makeMain(hub);
  });

  describe('startSession', () => {
    it('starts a session', () => {
      const session = startSession();

      expect(session).toMatchObject({
        status: 'ok',
        errors: 0,
        init: true,
        environment: 'production',
        ignoreDuration: false,
        sid: expect.any(String),
        did: undefined,
        timestamp: expect.any(Number),
        started: expect.any(Number),
        duration: expect.any(Number),
        toJSON: expect.any(Function),
      });
    });

    it('ends a previously active session and removes it from the scope', () => {
      const session1 = startSession();

      expect(session1.status).toBe('ok');
      expect(getIsolationScope().getSession()).toBe(session1);

      const session2 = startSession();

      expect(session2.status).toBe('ok');
      expect(session1.status).toBe('exited');
      expect(getIsolationScope().getSession()).toBe(session2);
    });
  });

  describe('endSession', () => {
    it('ends a session and removes it from the scope', () => {
      const session = startSession();

      expect(session.status).toBe('ok');
      expect(getIsolationScope().getSession()).toBe(session);

      endSession();

      expect(session.status).toBe('exited');
      expect(getIsolationScope().getSession()).toBe(undefined);
    });
  });

  describe('captureSession', () => {
    it('captures a session without ending it by default', () => {
      const session = startSession({ release: '1.0.0' });

      expect(session.status).toBe('ok');
      expect(session.init).toBe(true);
      expect(getIsolationScope().getSession()).toBe(session);

      captureSession();

      // this flag indicates the session was sent via BaseClient
      expect(session.init).toBe(false);

      // session is still active and on the scope
      expect(session.status).toBe('ok');
      expect(getIsolationScope().getSession()).toBe(session);
    });

    it('captures a session and ends it if end is `true`', () => {
      const session = startSession({ release: '1.0.0' });

      expect(session.status).toBe('ok');
      expect(session.init).toBe(true);
      expect(getIsolationScope().getSession()).toBe(session);

      captureSession(true);

      // this flag indicates the session was sent via BaseClient
      expect(session.init).toBe(false);

      // session is still active and on the scope
      expect(session.status).toBe('exited');
      expect(getIsolationScope().getSession()).toBe(undefined);
    });
  });

  describe('setUser', () => {
    it('should write to the isolation scope', () => {
      withIsolationScope(isolationScope => {
        setUser({ id: 'foo' });
        expect(isolationScope.getScopeData().user.id).toBe('foo');
      });
    });
  });

  describe('setTags', () => {
    it('should write to the isolation scope', () => {
      withIsolationScope(isolationScope => {
        setTags({ wee: true, woo: false });
        expect(isolationScope.getScopeData().tags['wee']).toBe(true);
        expect(isolationScope.getScopeData().tags['woo']).toBe(false);
      });
    });
  });

  describe('setTag', () => {
    it('should write to the isolation scope', () => {
      withIsolationScope(isolationScope => {
        setTag('foo', true);
        expect(isolationScope.getScopeData().tags['foo']).toBe(true);
      });
    });
  });

  describe('setExtras', () => {
    it('should write to the isolation scope', () => {
      withIsolationScope(isolationScope => {
        setExtras({ wee: { foo: 'bar' }, woo: { foo: 'bar' } });
        expect(isolationScope.getScopeData().extra?.wee).toEqual({ foo: 'bar' });
        expect(isolationScope.getScopeData().extra?.woo).toEqual({ foo: 'bar' });
      });
    });
  });

  describe('setExtra', () => {
    it('should write to the isolation scope', () => {
      withIsolationScope(isolationScope => {
        setExtra('foo', { bar: 'baz' });
        expect(isolationScope.getScopeData().extra?.foo).toEqual({ bar: 'baz' });
      });
    });
  });

  describe('setContext', () => {
    it('should write to the isolation scope', () => {
      withIsolationScope(isolationScope => {
        setContext('foo', { bar: 'baz' });
        expect(isolationScope.getScopeData().contexts?.foo?.bar).toBe('baz');
      });
    });
  });
});
