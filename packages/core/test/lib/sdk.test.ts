import { afterEach, beforeEach, describe, expect, it, type Mock, test, vi } from 'vitest';
import type { Client } from '../../src/client';
import { getClient, getCurrentScope, withScope } from '../../src/currentScopes';
import { close } from '../../src/exports';
import { captureCheckIn } from '../../src/monitor';
import { installedIntegrations } from '../../src/integration';
import { originalConsoleMethods } from '../../src/utils/debug-logger';
import { getActiveClient, initAndBind, setCurrentClient } from '../../src/sdk';
import type { Integration } from '../../src/types/integration';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

// eslint-disable-next-line no-var
declare var global: any;

const PUBLIC_DSN = 'https://username@domain/123';

export class MockIntegration implements Integration {
  public name: string;
  public setupOnce: () => void = vi.fn();
  public constructor(name: string) {
    this.name = name;
  }
}

describe('SDK', () => {
  beforeEach(() => {
    global.__SENTRY__ = {};
    installedIntegrations.splice(0);
  });

  describe('initAndBind', () => {
    test('installs integrations provided through options', () => {
      const integrations: Integration[] = [
        new MockIntegration('MockIntegration 1'),
        new MockIntegration('MockIntegration 2'),
      ];
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, integrations });
      initAndBind(TestClient, options);
      expect((integrations[0]?.setupOnce as Mock).mock.calls.length).toBe(1);
      expect((integrations[1]?.setupOnce as Mock).mock.calls.length).toBe(1);
    });

    test('calls hooks in the correct order', () => {
      const list: string[] = [];

      const integration1 = {
        name: 'integration1',
        setupOnce: vi.fn(() => list.push('setupOnce1')),
        afterAllSetup: vi.fn(() => list.push('afterAllSetup1')),
      } satisfies Integration;

      const integration2 = {
        name: 'integration2',
        setupOnce: vi.fn(() => list.push('setupOnce2')),
        setup: vi.fn(() => list.push('setup2')),
        afterAllSetup: vi.fn(() => list.push('afterAllSetup2')),
      } satisfies Integration;

      const integration3 = {
        name: 'integration3',
        setupOnce: vi.fn(() => list.push('setupOnce3')),
        setup: vi.fn(() => list.push('setup3')),
      } satisfies Integration;

      const integrations: Integration[] = [integration1, integration2, integration3];
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, integrations });
      initAndBind(TestClient, options);

      expect(integration1.setupOnce).toHaveBeenCalledTimes(1);
      expect(integration2.setupOnce).toHaveBeenCalledTimes(1);
      expect(integration3.setupOnce).toHaveBeenCalledTimes(1);

      expect(integration2.setup).toHaveBeenCalledTimes(1);
      expect(integration3.setup).toHaveBeenCalledTimes(1);

      expect(integration1.afterAllSetup).toHaveBeenCalledTimes(1);
      expect(integration2.afterAllSetup).toHaveBeenCalledTimes(1);

      expect(list).toEqual([
        'setupOnce1',
        'setupOnce2',
        'setup2',
        'setupOnce3',
        'setup3',
        'afterAllSetup1',
        'afterAllSetup2',
      ]);
    });

    test('returns client from init', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = initAndBind(TestClient, options);
      expect(client).not.toBeUndefined();
    });

    describe('when called again', () => {
      // `consoleSandbox` calls the method stored in `originalConsoleMethods`, so a
      // spy on `console.warn` misses the warning once the console is instrumented.
      const originalWarn = originalConsoleMethods.warn;
      let warnSpy: Mock;

      beforeEach(() => {
        warnSpy = vi.fn();
        originalConsoleMethods.warn = warnSpy;
      });

      afterEach(() => {
        if (originalWarn) {
          originalConsoleMethods.warn = originalWarn;
        } else {
          delete originalConsoleMethods.warn;
        }
      });

      test('does not warn on the first call', () => {
        initAndBind(TestClient, getDefaultTestClientOptions({ dsn: PUBLIC_DSN }));
        expect(warnSpy).not.toHaveBeenCalled();
      });

      test('warns and replaces the active client', () => {
        const first = initAndBind(TestClient, getDefaultTestClientOptions({ dsn: PUBLIC_DSN }));
        const second = initAndBind(TestClient, getDefaultTestClientOptions({ dsn: PUBLIC_DSN }));

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('`Sentry.init()` was called more than once'));
        expect(second).not.toBe(first);
        expect(getClient()).toBe(second);
      });

      test('does not warn after close() in a child scope', async () => {
        initAndBind(TestClient, getDefaultTestClientOptions({ dsn: PUBLIC_DSN }));
        await withScope(() => close());
        const second = initAndBind(TestClient, getDefaultTestClientOptions({ dsn: PUBLIC_DSN }));

        expect(warnSpy).not.toHaveBeenCalled();
        expect(getClient()).toBe(second);
      });

      test('does not warn after client.close()', async () => {
        const first = initAndBind(TestClient, getDefaultTestClientOptions({ dsn: PUBLIC_DSN }));
        await first.close();
        const second = initAndBind(TestClient, getDefaultTestClientOptions({ dsn: PUBLIC_DSN }));

        expect(warnSpy).not.toHaveBeenCalled();
        expect(getClient()).toBe(second);
      });

      test('does not warn after close()', async () => {
        const first = initAndBind(TestClient, getDefaultTestClientOptions({ dsn: PUBLIC_DSN }));
        await close();
        const second = initAndBind(TestClient, getDefaultTestClientOptions({ dsn: PUBLIC_DSN }));

        expect(warnSpy).not.toHaveBeenCalled();
        expect(second).not.toBe(first);
        expect(getClient()).toBe(second);
      });
    });
  });
});

describe('getActiveClient', () => {
  beforeEach(() => {
    global.__SENTRY__ = {};
  });

  test('returns the bound client', () => {
    const client = initAndBind(TestClient, getDefaultTestClientOptions({ dsn: PUBLIC_DSN }));

    expect(getActiveClient()).toBe(client);
  });

  test('returns undefined when no client is bound', () => {
    expect(getActiveClient()).toBeUndefined();
  });

  test('returns undefined for a closed client that is still bound', async () => {
    const client = initAndBind(TestClient, getDefaultTestClientOptions({ dsn: PUBLIC_DSN }));
    await client.close();

    expect(getClient()).toBe(client);
    expect(getActiveClient()).toBeUndefined();
  });

  test('returns undefined for a client that is still closing', () => {
    const client = initAndBind(TestClient, getDefaultTestClientOptions({ dsn: PUBLIC_DSN }));
    void client.close();

    expect(getActiveClient()).toBeUndefined();
  });

  test('returns a client that was created with enabled: false', () => {
    const client = initAndBind(TestClient, getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enabled: false }));

    expect(getActiveClient()).toBe(client);
  });
});

describe('close', () => {
  beforeEach(() => {
    global.__SENTRY__ = {};
  });

  test('unbinds the closed client', async () => {
    const client = initAndBind(TestClient, getDefaultTestClientOptions({ dsn: PUBLIC_DSN }));
    await close();

    expect(client.getOptions().enabled).toBe(false);
    expect(getClient()).toBeUndefined();
  });

  test('does not unbind a client that was bound while closing', async () => {
    const client = initAndBind(TestClient, getDefaultTestClientOptions({ dsn: PUBLIC_DSN }));
    const other = new TestClient(getDefaultTestClientOptions({ dsn: PUBLIC_DSN }));
    vi.spyOn(client, 'close').mockImplementation(async () => {
      setCurrentClient(other);
      return true;
    });

    await close();

    expect(getClient()).toBe(other);
  });
});

describe('captureCheckIn', () => {
  it('returns an id when client is defined', () => {
    const client = {
      captureCheckIn: () => 'some-id-wasd-1234',
    } as unknown as Client;
    setCurrentClient(client);

    expect(captureCheckIn({ monitorSlug: 'gogogo', status: 'in_progress' })).toStrictEqual('some-id-wasd-1234');
  });

  it('returns an id when client is undefined', () => {
    getCurrentScope().setClient(undefined);
    expect(captureCheckIn({ monitorSlug: 'gogogo', status: 'in_progress' })).toStrictEqual(expect.any(String));
  });
});
