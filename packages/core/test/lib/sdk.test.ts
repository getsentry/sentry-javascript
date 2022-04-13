import { Scope } from '@sentry/hub';
import { Client, Integration } from '@sentry/types';

import { installedIntegrations } from '../../src/integration';
import { initAndBind } from '../../src/sdk';
import { setupTestTransport, TestClient } from '../mocks/client';

// eslint-disable-next-line no-var
declare var global: any;

const PUBLIC_DSN = 'https://username@domain/123';

jest.mock('@sentry/hub', () => {
  const original = jest.requireActual('@sentry/hub');
  return {
    ...original,
    getCurrentHub(): {
      bindClient(client: Client): boolean;
      getClient(): boolean;
      getScope(): Scope;
    } {
      return {
        getClient(): boolean {
          return false;
        },
        getScope(): Scope {
          return new Scope();
        },
        bindClient(client: Client): boolean {
          client.setupIntegrations();
          return true;
        },
      };
    },
  };
});

class MockIntegration implements Integration {
  public name: string;
  public setupOnce: () => void = jest.fn();
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
    test('installs default integrations', () => {
      const DEFAULT_INTEGRATIONS: Integration[] = [
        new MockIntegration('MockIntegration 1'),
        new MockIntegration('MockIntegration 2'),
      ];
      const options = { dsn: PUBLIC_DSN, defaultIntegrations: DEFAULT_INTEGRATIONS };
      initAndBind(TestClient, options, setupTestTransport(options).transport);
      expect((DEFAULT_INTEGRATIONS[0].setupOnce as jest.Mock).mock.calls.length).toBe(1);
      expect((DEFAULT_INTEGRATIONS[1].setupOnce as jest.Mock).mock.calls.length).toBe(1);
    });

    test("doesn't install default integrations if told not to", () => {
      const DEFAULT_INTEGRATIONS: Integration[] = [
        new MockIntegration('MockIntegration 1'),
        new MockIntegration('MockIntegration 2'),
      ];
      const options = { dsn: PUBLIC_DSN, defaultIntegrations: false as false };
      initAndBind(TestClient, options, setupTestTransport(options).transport);
      expect((DEFAULT_INTEGRATIONS[0].setupOnce as jest.Mock).mock.calls.length).toBe(0);
      expect((DEFAULT_INTEGRATIONS[1].setupOnce as jest.Mock).mock.calls.length).toBe(0);
    });

    test('installs integrations provided through options', () => {
      const integrations: Integration[] = [
        new MockIntegration('MockIntegration 1'),
        new MockIntegration('MockIntegration 2'),
      ];
      const options = { dsn: PUBLIC_DSN, integrations };
      initAndBind(TestClient, options, setupTestTransport(options).transport);
      expect((integrations[0].setupOnce as jest.Mock).mock.calls.length).toBe(1);
      expect((integrations[1].setupOnce as jest.Mock).mock.calls.length).toBe(1);
    });

    test('installs merged default integrations, with overrides provided through options', () => {
      const DEFAULT_INTEGRATIONS: Integration[] = [
        new MockIntegration('MockIntegration 1'),
        new MockIntegration('MockIntegration 2'),
      ];
      const integrations: Integration[] = [
        new MockIntegration('MockIntegration 1'),
        new MockIntegration('MockIntegration 3'),
      ];
      const options = { dsn: PUBLIC_DSN, defaultIntegrations: DEFAULT_INTEGRATIONS, integrations };
      initAndBind(TestClient, options, setupTestTransport(options).transport);
      // 'MockIntegration 1' should be overridden by the one with the same name provided through options
      expect((DEFAULT_INTEGRATIONS[0].setupOnce as jest.Mock).mock.calls.length).toBe(0);
      expect((DEFAULT_INTEGRATIONS[1].setupOnce as jest.Mock).mock.calls.length).toBe(1);
      expect((integrations[0].setupOnce as jest.Mock).mock.calls.length).toBe(1);
      expect((integrations[1].setupOnce as jest.Mock).mock.calls.length).toBe(1);
    });

    test('installs integrations returned from a callback function', () => {
      const DEFAULT_INTEGRATIONS: Integration[] = [
        new MockIntegration('MockIntegration 1'),
        new MockIntegration('MockIntegration 2'),
      ];
      const newIntegration = new MockIntegration('MockIntegration 3');
      const options = {
        defaultIntegrations: DEFAULT_INTEGRATIONS,
        dsn: PUBLIC_DSN,
        integrations: (integrations: Integration[]) => integrations.slice(0, 1).concat(newIntegration),
      };
      initAndBind(TestClient, options, setupTestTransport(options).transport);
      expect((DEFAULT_INTEGRATIONS[0].setupOnce as jest.Mock).mock.calls.length).toBe(1);
      expect((newIntegration.setupOnce as jest.Mock).mock.calls.length).toBe(1);
      expect((DEFAULT_INTEGRATIONS[1].setupOnce as jest.Mock).mock.calls.length).toBe(0);
    });
  });
});
