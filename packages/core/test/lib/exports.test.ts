import { Hub, Scope, getCurrentScope, makeMain, withScope } from '../../src';
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
    const res = withScope(scope => {
      return 'foo';
    });

    expect(res).toBe('foo');
  });

  it('works with an async function return value', async () => {
    const res = withScope(async scope => {
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
});
