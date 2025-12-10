import { type Integration } from '@sentry/core';
import * as sentryNode from '@sentry/node';
import type { Mock } from 'bun:test';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { getClient, init } from '../src';

const PUBLIC_DSN = 'https://username@domain/123';

class MockIntegration implements Integration {
  public name: string;
  public setupOnce: Mock<() => void>;
  public constructor(name: string) {
    this.name = name;
    this.setupOnce = mock(() => undefined);
  }
}

describe('init()', () => {
  let mockAutoPerformanceIntegrations: Mock<() => Integration[]>;

  beforeEach(() => {
    // @ts-expect-error weird
    mockAutoPerformanceIntegrations = spyOn(sentryNode, 'getAutoPerformanceIntegrations');
  });

  afterEach(() => {
    mockAutoPerformanceIntegrations.mockRestore();
  });

  describe('integrations', () => {
    it("doesn't install default integrations if told not to", () => {
      init({ dsn: PUBLIC_DSN, defaultIntegrations: false });

      const client = getClient();

      expect(client?.getOptions().integrations).toEqual([]);

      expect(mockAutoPerformanceIntegrations).toHaveBeenCalledTimes(0);
    });

    it('enables spotlight with default URL from config `true`', () => {
      const client = init({ dsn: PUBLIC_DSN, spotlight: true });

      expect(client?.getOptions().spotlight).toBe(true);
      expect(client?.getOptions().integrations.some(integration => integration.name === 'Spotlight')).toBe(true);
    });

    it('disables spotlight from config `false`', () => {
      const client = init({ dsn: PUBLIC_DSN, spotlight: false });

      expect(client?.getOptions().spotlight).toBe(false);
      expect(client?.getOptions().integrations.some(integration => integration.name === 'Spotlight')).toBe(false);
    });

    it('installs merged default integrations, with overrides provided through options', () => {
      const mockDefaultIntegrations = [
        new MockIntegration('Some mock integration 2.1'),
        new MockIntegration('Some mock integration 2.2'),
      ];

      const mockIntegrations = [
        new MockIntegration('Some mock integration 2.1'),
        new MockIntegration('Some mock integration 2.3'),
      ];

      init({ dsn: PUBLIC_DSN, integrations: mockIntegrations, defaultIntegrations: mockDefaultIntegrations });

      expect(mockDefaultIntegrations[0]?.setupOnce).toHaveBeenCalledTimes(0);
      expect(mockDefaultIntegrations[1]?.setupOnce).toHaveBeenCalledTimes(1);
      expect(mockIntegrations[0]?.setupOnce).toHaveBeenCalledTimes(1);
      expect(mockIntegrations[1]?.setupOnce).toHaveBeenCalledTimes(1);
      expect(mockAutoPerformanceIntegrations).toHaveBeenCalledTimes(0);
    });

    it('installs integrations returned from a callback function', () => {
      const mockDefaultIntegrations = [
        new MockIntegration('Some mock integration 3.1'),
        new MockIntegration('Some mock integration 3.2'),
      ];

      const newIntegration = new MockIntegration('Some mock integration 3.3');

      init({
        dsn: PUBLIC_DSN,
        defaultIntegrations: mockDefaultIntegrations,
        integrations: integrations => {
          const newIntegrations = [...integrations];
          newIntegrations[1] = newIntegration;
          return newIntegrations;
        },
      });

      expect(mockDefaultIntegrations[0]?.setupOnce).toHaveBeenCalledTimes(1);
      expect(mockDefaultIntegrations[1]?.setupOnce).toHaveBeenCalledTimes(0);
      expect(newIntegration.setupOnce).toHaveBeenCalledTimes(1);
      expect(mockAutoPerformanceIntegrations).toHaveBeenCalledTimes(0);
    });

    it('installs performance default instrumentations if tracing is enabled', () => {
      const autoPerformanceIntegrations = [new MockIntegration('Performance integration')];
      mockAutoPerformanceIntegrations.mockImplementation(() => autoPerformanceIntegrations);

      const mockIntegrations = [
        new MockIntegration('Some mock integration 4.1'),
        new MockIntegration('Some mock integration 4.3'),
      ];

      init({
        dsn: PUBLIC_DSN,
        integrations: mockIntegrations,
        tracesSampleRate: 1,
      });

      expect(mockIntegrations[0]?.setupOnce).toHaveBeenCalledTimes(1);
      expect(mockIntegrations[1]?.setupOnce).toHaveBeenCalledTimes(1);
      expect(autoPerformanceIntegrations[0]?.setupOnce).toHaveBeenCalledTimes(1);
      expect(mockAutoPerformanceIntegrations).toHaveBeenCalledTimes(1);

      const integrations = getClient()?.getOptions().integrations;
      expect(integrations).toBeArray();
      expect(integrations?.map(({ name }) => name)).toContain('Performance integration');
      expect(integrations?.map(({ name }) => name)).toContain('Some mock integration 4.1');
      expect(integrations?.map(({ name }) => name)).toContain('Some mock integration 4.3');
    });
  });
});
