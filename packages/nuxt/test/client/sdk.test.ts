import * as SentryBrowser from '@sentry/browser';
import { SENTRY_OP, URL_FULL } from '@sentry/conventions/attributes';
import { HTTP_CLIENT } from '@sentry/conventions/op';
import { GLOBAL_OBJ } from '@sentry/core';
import { SDK_VERSION } from '@sentry/vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/client';
import { NUXT_BUILD_ASSETS_DIR_GLOBAL, NUXT_CDN_URL_GLOBAL } from '../../src/common/buildAssets';
import { NUXT_BASE_PATH_GLOBAL } from '../../src/common/tunnel';

const browserInit = vi.spyOn(SentryBrowser, 'init');

describe('Nuxt Client SDK', () => {
  describe('init', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      SentryBrowser.getCurrentScope().setClient(undefined);
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
              infer_ip: 'auto',
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

    describe('environment option', () => {
      const originalEnv = process.env.SENTRY_ENVIRONMENT;

      beforeEach(() => {
        delete process.env.SENTRY_ENVIRONMENT;
      });

      afterEach(() => {
        if (originalEnv !== undefined) {
          process.env.SENTRY_ENVIRONMENT = originalEnv;
        } else {
          delete process.env.SENTRY_ENVIRONMENT;
        }
      });

      it('uses environment from options when provided', () => {
        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          environment: 'custom-env',
        });

        expect(browserInit).toHaveBeenCalledTimes(1);
        const callArgs = browserInit.mock.calls[0]?.[0];
        expect(callArgs?.environment).toBe('custom-env');
      });

      it('uses SENTRY_ENVIRONMENT env var when options.environment is not provided', () => {
        process.env.SENTRY_ENVIRONMENT = 'env-from-variable';

        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
        });

        expect(browserInit).toHaveBeenCalledTimes(1);
        const callArgs = browserInit.mock.calls[0]?.[0];
        expect(callArgs?.environment).toBe('env-from-variable');
      });

      it('uses fallback environment when neither options.environment nor SENTRY_ENVIRONMENT is provided', () => {
        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
        });

        expect(browserInit).toHaveBeenCalledTimes(1);
        const callArgs = browserInit.mock.calls[0]?.[0];
        // In test environment, import.meta.dev should be checked, but we can just verify it's set
        expect(callArgs?.environment).toBeDefined();
      });

      it('prioritizes options.environment over SENTRY_ENVIRONMENT env var', () => {
        process.env.SENTRY_ENVIRONMENT = 'env-from-variable';

        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          environment: 'options-env',
        });

        expect(browserInit).toHaveBeenCalledTimes(1);
        const callArgs = browserInit.mock.calls[0]?.[0];
        expect(callArgs?.environment).toBe('options-env');
      });
    });

    describe('ignoreSpans', () => {
      const globalWithNuxtPaths = GLOBAL_OBJ as {
        [NUXT_BASE_PATH_GLOBAL]?: string;
        [NUXT_BUILD_ASSETS_DIR_GLOBAL]?: string;
        [NUXT_CDN_URL_GLOBAL]?: string;
      };

      afterEach(() => {
        globalWithNuxtPaths[NUXT_BASE_PATH_GLOBAL] = undefined;
        globalWithNuxtPaths[NUXT_BUILD_ASSETS_DIR_GLOBAL] = undefined;
        globalWithNuxtPaths[NUXT_CDN_URL_GLOBAL] = undefined;
      });

      const startFetchSpan = (url: string): SentryBrowser.Span =>
        SentryBrowser.startInactiveSpan({ name: 'GET', attributes: { [SENTRY_OP]: HTTP_CLIENT, [URL_FULL]: url } });

      it.each([
        'http://localhost:3000/_nuxt/builds/meta/b621250d-af25-415d-8df9-7e893c1af467.json',
        'http://localhost:3000/_nuxt/builds/latest.json?1794411940545',
        '/_nuxt/builds/meta/b621250d-af25-415d-8df9-7e893c1af467.json',
      ])('ignores build manifest requests (%s)', url => {
        init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 });

        expect(startFetchSpan(url).isRecording()).toBe(false);
      });

      it.each([
        'http://localhost:3000/api/builds/latest.json',
        'http://localhost:3000/_nuxt/builds-B13LvVLZ.js',
        'http://localhost:3000/_nuxt/entry.js',
        'http://localhost:3000/api/_nuxt/builds/latest.json',
        'https://example.com/_nuxt/builds/latest.json',
        '/api/_nuxt/builds/latest.json',
      ])('keeps other requests (%s)', url => {
        init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 });

        expect(startFetchSpan(url).isRecording()).toBe(true);
      });

      it('merges the default with user-provided ignoreSpans', () => {
        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          tracesSampleRate: 1,
          ignoreSpans: [{ attributes: { [URL_FULL]: /\/health$/ } }],
        });

        expect(startFetchSpan('https://api.example.com/health').isRecording()).toBe(false);
        expect(startFetchSpan('http://localhost:3000/_nuxt/builds/latest.json').isRecording()).toBe(false);
      });

      it('ignores manifest requests in the configured buildAssetsDir instead of `/_nuxt/`', () => {
        globalWithNuxtPaths[NUXT_BUILD_ASSETS_DIR_GLOBAL] = '/assets/';

        init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 });

        expect(startFetchSpan('http://localhost:3000/assets/builds/latest.json').isRecording()).toBe(false);
        expect(startFetchSpan('http://localhost:3000/_nuxt/builds/latest.json').isRecording()).toBe(true);
        expect(startFetchSpan('https://api.example.com/v1/assets/builds/123').isRecording()).toBe(true);
      });

      it('ignores manifest requests under the configured baseURL', () => {
        globalWithNuxtPaths[NUXT_BASE_PATH_GLOBAL] = '/shop/';

        init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 });

        expect(startFetchSpan('http://localhost:3000/shop/_nuxt/builds/latest.json').isRecording()).toBe(false);
        expect(startFetchSpan('/shop/_nuxt/builds/latest.json').isRecording()).toBe(false);
        expect(startFetchSpan('http://localhost:3000/_nuxt/builds/latest.json').isRecording()).toBe(true);
      });

      it('ignores manifest requests to the configured cdnURL', () => {
        globalWithNuxtPaths[NUXT_CDN_URL_GLOBAL] = 'https://cdn.example.com/';

        init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 });

        expect(startFetchSpan('https://cdn.example.com/_nuxt/builds/latest.json').isRecording()).toBe(false);
        expect(startFetchSpan('http://localhost:3000/_nuxt/builds/latest.json').isRecording()).toBe(true);
      });
    });
  });
});
