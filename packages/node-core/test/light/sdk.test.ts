import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '../../src/light';
import { LightNodeClient } from '../../src/light/client';
import { cleanupLightSdk, mockLightSdkInit, resetGlobals } from '../helpers/mockLightSdkInit';

describe('Light Mode | SDK', () => {
  afterEach(() => {
    cleanupLightSdk();
  });

  describe('init', () => {
    it('returns a LightNodeClient', () => {
      const client = mockLightSdkInit();

      expect(client).toBeInstanceOf(LightNodeClient);
    });

    it('sets correct SDK metadata', () => {
      const client = mockLightSdkInit();

      const metadata = client?.getOptions()._metadata;
      expect(metadata?.sdk?.name).toBe('sentry.javascript.node-light');
      expect(metadata?.sdk?.packages).toEqual([
        {
          name: 'npm:@sentry/node-core',
          version: expect.any(String),
        },
      ]);
    });

    it('sets the client on the current scope', () => {
      const client = mockLightSdkInit();

      expect(Sentry.getClient()).toBe(client);
    });

    it('applies initialScope options', () => {
      mockLightSdkInit({
        initialScope: {
          tags: { initialTag: 'initialValue' },
          user: { id: 'test-user' },
        },
      });

      const scope = Sentry.getCurrentScope();
      expect(scope.getScopeData().tags).toEqual({ initialTag: 'initialValue' });
      expect(scope.getScopeData().user).toEqual({ id: 'test-user' });
    });

    it('respects environment from options', () => {
      const client = mockLightSdkInit({
        environment: 'test-environment',
      });

      expect(client?.getOptions().environment).toBe('test-environment');
    });

    it('respects release from options', () => {
      const client = mockLightSdkInit({
        release: 'test-release@1.0.0',
      });

      expect(client?.getOptions().release).toBe('test-release@1.0.0');
    });
  });

  describe('initWithoutDefaultIntegrations', () => {
    it('initializes without default integrations', () => {
      resetGlobals();
      const client = Sentry.initWithoutDefaultIntegrations({
        dsn: 'https://username@domain/123',
      });

      // Should have no integrations
      const integrations = client.getOptions().integrations;
      expect(integrations).toEqual([]);
    });
  });

  describe('getDefaultIntegrations', () => {
    it('returns an array of integrations', () => {
      const integrations = Sentry.getDefaultIntegrations();

      expect(Array.isArray(integrations)).toBe(true);
      expect(integrations.length).toBeGreaterThan(0);

      // Check that some expected integrations are present
      const integrationNames = integrations.map(i => i.name);
      expect(integrationNames).toContain('EventFilters');
      expect(integrationNames).toContain('FunctionToString');
      expect(integrationNames).toContain('LinkedErrors');
      expect(integrationNames).toContain('OnUncaughtException');
      expect(integrationNames).toContain('OnUnhandledRejection');
    });

    it('includes Http.Server integration for request isolation', () => {
      const integrations = Sentry.getDefaultIntegrations();
      const integrationNames = integrations.map(i => i.name);

      expect(integrationNames).toContain('Http.Server');
    });
  });

  describe('isInitialized', () => {
    it('returns false before init', () => {
      resetGlobals();
      expect(Sentry.isInitialized()).toBe(false);
    });

    it('returns true after init', () => {
      mockLightSdkInit();
      expect(Sentry.isInitialized()).toBe(true);
    });
  });

  describe('close', () => {
    it('flushes and closes the client', async () => {
      const client = mockLightSdkInit();

      const flushSpy = vi.spyOn(client!, 'flush');

      await Sentry.close();

      expect(flushSpy).toHaveBeenCalled();
    });
  });

  describe('flush', () => {
    it('flushes pending events', async () => {
      const beforeSend = vi.fn(() => null);
      mockLightSdkInit({ beforeSend });

      Sentry.captureException(new Error('test'));

      await Sentry.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);
    });
  });
});
