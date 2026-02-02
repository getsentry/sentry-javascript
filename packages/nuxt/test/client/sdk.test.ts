import * as SentryBrowser from '@sentry/browser';
import { SDK_VERSION } from '@sentry/vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/client';

const browserInit = vi.spyOn(SentryBrowser, 'init');

describe('Nuxt Client SDK', () => {
  describe('init', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('Adds Nuxt metadata to the SDK options', () => {
      expect(browserInit).not.toHaveBeenCalled();

      init({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      });

      const expectedMetadata = {
        _metadata: {
          sdk: {
            name: 'sentry.javascript.nuxt',
            version: SDK_VERSION,
            packages: [
              { name: 'npm:@sentry/nuxt', version: SDK_VERSION },
              { name: 'npm:@sentry/vue', version: SDK_VERSION },
            ],
            settings: {
              infer_ip: 'never',
            },
          },
        },
      };

      expect(browserInit).toHaveBeenCalledTimes(1);
      expect(browserInit).toHaveBeenLastCalledWith(expect.objectContaining(expectedMetadata));
    });

    it('returns client from init', () => {
      expect(init({})).not.toBeUndefined();
    });

    it('uses default integrations when not provided in options', () => {
      init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      expect(browserInit).toHaveBeenCalledTimes(1);
      const callArgs = browserInit.mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs?.defaultIntegrations).toBeDefined();
      expect(Array.isArray(callArgs?.defaultIntegrations)).toBe(true);
    });

    it('allows options.defaultIntegrations to override default integrations', () => {
      const customIntegrations = [{ name: 'CustomIntegration' }];

      init({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        defaultIntegrations: customIntegrations as any,
      });

      expect(browserInit).toHaveBeenCalledTimes(1);
      const callArgs = browserInit.mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs?.defaultIntegrations).toBe(customIntegrations);
    });

    it('allows options.defaultIntegrations to be set to false', () => {
      init({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        defaultIntegrations: false,
      });

      expect(browserInit).toHaveBeenCalledTimes(1);
      const callArgs = browserInit.mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs?.defaultIntegrations).toBe(false);
    });
  });
});
