import { type Mock, beforeEach, describe, expect, it, test, vi } from 'vitest';
import type { Client } from '../../src/client';
import { captureCheckIn } from '../../src/exports';
import { getCurrentScope } from '../../src/currentScopes';
import { setCurrentClient } from '../../src/sdk';
import { installedIntegrations } from '../../src/integration';
import { initAndBind } from '../../src/sdk';
import type { Integration } from '../../src/types-hoist/integration';
import { TestClient, getDefaultTestClientOptions } from '../mocks/client';

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
