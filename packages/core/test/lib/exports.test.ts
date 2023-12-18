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

  it('works with an async function', async () => {
    const res = withScope(async scope => {
      return 'foo';
    });

    expect(res).toBeInstanceOf(Promise);
    expect(await res).toBe('foo');
  });
});
