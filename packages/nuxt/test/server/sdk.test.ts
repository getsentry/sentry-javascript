import { HTTP_REQUEST_METHOD, SENTRY_OP, URL_PATH } from '@sentry/conventions/attributes';
import { HTTP_SERVER } from '@sentry/conventions/op';
import { GLOBAL_OBJ, originalConsoleMethods } from '@sentry/core';
import * as SentryNode from '@sentry/node';
import { getGlobalScope, SDK_VERSION } from '@sentry/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NUXT_BUILD_ASSETS_DIR_GLOBAL, NUXT_PUBLIC_FILES_GLOBAL } from '../../src/common/buildAssets';
import { NUXT_DEV_MODE_FLAG, NUXT_PRERENDER_FLAG, NUXT_SERVER_INITIALIZED_FLAG } from '../../src/common/devMode';
import { NUXT_BASE_PATH_GLOBAL } from '../../src/common/tunnel';
import { init } from '../../src/server';
import { clientSourceMapErrorFilter } from '../../src/server/sdk';

const nodeInit = vi.spyOn(SentryNode, 'init');

describe('Nuxt Server SDK', () => {
  describe('init', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Each test needs a fresh init; the double-init guard would otherwise skip every later call.
      delete (globalThis as { __SENTRY_NUXT_SERVER_INITIALIZED__?: boolean }).__SENTRY_NUXT_SERVER_INITIALIZED__;
      delete (globalThis as { __SENTRY_NUXT_PRERENDER__?: boolean }).__SENTRY_NUXT_PRERENDER__;
      SentryNode.getCurrentScope().setClient(undefined);
    });

    it('Adds Nuxt metadata to the SDK options', () => {
      expect(nodeInit).not.toHaveBeenCalled();

      init({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      });

      const expectedMetadata = {
        _metadata: {
          optionsSetByUser: ['dsn'],
          sdk: {
            name: 'sentry.javascript.nuxt',
            version: SDK_VERSION,
            packages: [
              { name: 'npm:@sentry/nuxt', version: SDK_VERSION },
              { name: 'npm:@sentry/node', version: SDK_VERSION },
            ],
          },
        },
      };

      expect(nodeInit).toHaveBeenCalledTimes(1);
      expect(nodeInit).toHaveBeenLastCalledWith(expect.objectContaining(expectedMetadata));
    });

    it('returns client from init', () => {
      expect(init({})).not.toBeUndefined();
    });

    describe('initialization guards', () => {
      it('skips initialization during a prerender build', () => {
        const globalWithFlag = globalThis as { __SENTRY_NUXT_PRERENDER__?: boolean };

        // The generated runtime-flags module sets this by name, so a rename must break the test rather than the runtime.
        expect(NUXT_PRERENDER_FLAG).toBe('__SENTRY_NUXT_PRERENDER__');

        globalWithFlag.__SENTRY_NUXT_PRERENDER__ = true;

        const client = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

        expect(client).toBeUndefined();
        expect(nodeInit).not.toHaveBeenCalled();
      });

      it('skips a second initialization and notifies that the `--import` preload is removable', () => {
        // A `node --import` preload of the config file initializes once before the bundled config does.
        expect(NUXT_SERVER_INITIALIZED_FLAG).toBe('__SENTRY_NUXT_SERVER_INITIALIZED__');
        // `consoleSandbox` swaps in the method recorded in `originalConsoleMethods`, so a spy on
        // `console.log` never sees the notice — intercept the sandboxed method instead.
        const logMock = vi.fn();
        const originalLog = originalConsoleMethods.log;
        originalConsoleMethods.log = logMock;

        try {
          const firstClient = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });
          const secondClient = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

          expect(nodeInit).toHaveBeenCalledTimes(1);
          expect(secondClient).toBe(firstClient);
          expect(logMock).toHaveBeenCalledWith(expect.stringContaining('already initialized'));
        } finally {
          originalConsoleMethods.log = originalLog;
        }
      });

      it('initializes again after close()', async () => {
        const firstClient = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });
        await SentryNode.close();
        const secondClient = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

        expect(nodeInit).toHaveBeenCalledTimes(2);
        expect(secondClient).toBeDefined();
        expect(secondClient).not.toBe(firstClient);
      });

      it('initializes again after the existing client is closed', async () => {
        const firstClient = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });
        await firstClient?.close();
        const secondClient = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

        expect(nodeInit).toHaveBeenCalledTimes(2);
        expect(secondClient).toBeDefined();
        expect(secondClient).not.toBe(firstClient);
      });

      it('marks a successful initialization for the double-init guard', () => {
        init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

        expect(
          (globalThis as { __SENTRY_NUXT_SERVER_INITIALIZED__?: boolean }).__SENTRY_NUXT_SERVER_INITIALIZED__,
        ).toBe(true);
      });
    });

    it('delegates default integrations to initNode when not provided in options', () => {
      // Resolving them here would pin the selection to the raw options, before `initNode`
      // resolves `SENTRY_TRACES_SAMPLE_RATE`, and would drop the performance integrations
      // for anyone enabling tracing purely through the environment.
      init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      expect(nodeInit).toHaveBeenCalledTimes(1);
      expect(nodeInit).toHaveBeenCalledWith(expect.not.objectContaining({ defaultIntegrations: expect.anything() }));
    });

    it('allows options.defaultIntegrations to override default integrations', () => {
      const customIntegrations = [{ name: 'CustomIntegration' }];

      init({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        defaultIntegrations: customIntegrations as any,
      });

      expect(nodeInit).toHaveBeenCalledTimes(1);
      const callArgs = nodeInit.mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs?.defaultIntegrations).toBe(customIntegrations);
    });

    it('allows options.defaultIntegrations to be set to false', () => {
      init({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        defaultIntegrations: false,
      });

      expect(nodeInit).toHaveBeenCalledTimes(1);
      const callArgs = nodeInit.mock.calls[0]?.[0];
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

        expect(nodeInit).toHaveBeenCalledTimes(1);
        const callArgs = nodeInit.mock.calls[0]?.[0];
        expect(callArgs?.environment).toBe('custom-env');
      });

      it('uses SENTRY_ENVIRONMENT env var when options.environment is not provided', () => {
        process.env.SENTRY_ENVIRONMENT = 'env-from-variable';

        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
        });

        expect(nodeInit).toHaveBeenCalledTimes(1);
        const callArgs = nodeInit.mock.calls[0]?.[0];
        expect(callArgs?.environment).toBe('env-from-variable');
      });

      it('uses fallback environment when neither options.environment nor SENTRY_ENVIRONMENT is provided', () => {
        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
        });

        expect(nodeInit).toHaveBeenCalledTimes(1);
        const callArgs = nodeInit.mock.calls[0]?.[0];
        // Should fallback to either 'development' or 'production' depending on the environment
        expect(callArgs?.environment).toBeDefined();
      });

      it('falls back to the dev environment when preloaded by the generated dev config file', () => {
        const globalWithFlag = globalThis as { __SENTRY_NUXT_DEV_MODE__?: boolean };

        // The generated file sets this by name, so a rename must break the test rather than the runtime.
        expect(NUXT_DEV_MODE_FLAG).toBe('__SENTRY_NUXT_DEV_MODE__');

        globalWithFlag.__SENTRY_NUXT_DEV_MODE__ = true;

        try {
          init({
            dsn: 'https://public@dsn.ingest.sentry.io/1337',
          });

          expect(nodeInit).toHaveBeenCalledWith(expect.objectContaining({ environment: 'development' }));
        } finally {
          globalWithFlag.__SENTRY_NUXT_DEV_MODE__ = undefined;
        }
      });

      it('falls back to the production environment without the dev flag', () => {
        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
        });

        expect(nodeInit).toHaveBeenCalledWith(expect.objectContaining({ environment: 'production' }));
      });

      it('prioritizes options.environment over SENTRY_ENVIRONMENT env var', () => {
        process.env.SENTRY_ENVIRONMENT = 'env-from-variable';

        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          environment: 'options-env',
        });

        expect(nodeInit).toHaveBeenCalledTimes(1);
        const callArgs = nodeInit.mock.calls[0]?.[0];
        expect(callArgs?.environment).toBe('options-env');
      });
    });

    describe('ignoreSpans', () => {
      const startServerSpan = (path: string, method = 'GET'): SentryNode.Span =>
        SentryNode.startInactiveSpan({
          name: method,
          forceTransaction: true,
          attributes: { [SENTRY_OP]: HTTP_SERVER, [URL_PATH]: path, [HTTP_REQUEST_METHOD]: method },
        });

      it.each([
        '/_nuxt/entry.js',
        '/_nuxt/entry.js.map',
        '/_nuxt/builds/meta/b621250d-af25-415d-8df9-7e893c1af467.json',
        '/_nuxt/builds/latest.json',
      ])('ignores build asset requests (%s)', path => {
        init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 });

        expect(startServerSpan(path).isRecording()).toBe(false);
      });

      it.each([
        '/',
        '/_server',
        '/user/jane.doe',
        '/api/data.json',
        '/blog/_payload.json',
        '/blog/_nuxt-tips',
        '/blog/_nuxt/',
        '/api/_nuxt/entry.js.map',
      ])('keeps route requests (%s)', path => {
        init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 });

        expect(startServerSpan(path).isRecording()).toBe(true);
      });

      it('merges the default with user-provided ignoreSpans', () => {
        init({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          tracesSampleRate: 1,
          ignoreSpans: [{ attributes: { [URL_PATH]: '/health' } }],
        });

        expect(startServerSpan('/health').isRecording()).toBe(false);
        expect(startServerSpan('/_nuxt/entry.js').isRecording()).toBe(false);
      });

      describe('with configured app paths', () => {
        const globalWithNuxtPaths = GLOBAL_OBJ as {
          [NUXT_BASE_PATH_GLOBAL]?: string;
          [NUXT_BUILD_ASSETS_DIR_GLOBAL]?: string;
        };

        afterEach(() => {
          globalWithNuxtPaths[NUXT_BASE_PATH_GLOBAL] = undefined;
          globalWithNuxtPaths[NUXT_BUILD_ASSETS_DIR_GLOBAL] = undefined;
        });

        it('ignores requests for the configured `buildAssetsDir` instead of `/_nuxt/`', () => {
          globalWithNuxtPaths[NUXT_BUILD_ASSETS_DIR_GLOBAL] = '/assets/';

          init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 });

          expect(startServerSpan('/assets/entry.js.map').isRecording()).toBe(false);
          expect(startServerSpan('/_nuxt/entry.js.map').isRecording()).toBe(true);
        });

        it.each(['/blog/assets/', '/api/assets/123', '/user/assets/avatar.json'])(
          'keeps routes that contain the configured `buildAssetsDir` after the start (%s)',
          path => {
            globalWithNuxtPaths[NUXT_BUILD_ASSETS_DIR_GLOBAL] = '/assets/';

            init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 });

            expect(startServerSpan(path).isRecording()).toBe(true);
          },
        );

        it('ignores build asset requests under the configured `baseURL`', () => {
          globalWithNuxtPaths[NUXT_BASE_PATH_GLOBAL] = '/shop/';

          init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 });

          expect(startServerSpan('/shop/_nuxt/entry.js.map').isRecording()).toBe(false);
          expect(startServerSpan('/shop/blog/_nuxt/entry.js.map').isRecording()).toBe(true);
        });

        it('keeps all requests when the build output is served from the root', () => {
          globalWithNuxtPaths[NUXT_BUILD_ASSETS_DIR_GLOBAL] = '/';

          init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 });

          expect(startServerSpan('/user/jane.doe').isRecording()).toBe(true);
        });
      });

      describe('with public files', () => {
        const globalWithNuxtPaths = GLOBAL_OBJ as {
          [NUXT_BASE_PATH_GLOBAL]?: string;
          [NUXT_PUBLIC_FILES_GLOBAL]?: string[];
        };

        beforeEach(() => {
          globalWithNuxtPaths[NUXT_PUBLIC_FILES_GLOBAL] = ['/docs/guide.pdf', '/humans.txt'];
        });

        afterEach(() => {
          globalWithNuxtPaths[NUXT_BASE_PATH_GLOBAL] = undefined;
          globalWithNuxtPaths[NUXT_PUBLIC_FILES_GLOBAL] = undefined;
        });

        it.each(['/docs/guide.pdf', '/humans.txt'])('ignores GET requests for public files (%s)', path => {
          init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 });

          expect(startServerSpan(path).isRecording()).toBe(false);
        });

        it.each(['/docs/', '/docs/guide', '/docs/guide.pdf/', '/humans.txt.bak', '/blog/humans.txt'])(
          'keeps requests that only resemble a public file (%s)',
          path => {
            init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 });

            expect(startServerSpan(path).isRecording()).toBe(true);
          },
        );

        it('keeps other methods than GET, which reach the routes', () => {
          init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 });

          expect(startServerSpan('/humans.txt', 'POST').isRecording()).toBe(true);
        });

        it('ignores public files under the configured `baseURL`', () => {
          globalWithNuxtPaths[NUXT_BASE_PATH_GLOBAL] = '/shop/';

          init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 });

          expect(startServerSpan('/shop/humans.txt').isRecording()).toBe(false);
          expect(startServerSpan('/humans.txt').isRecording()).toBe(true);
        });
      });
    });

    it('registers its event processors on the client', () => {
      const client = init({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      });

      const ids = client?.getEventProcessors().map(processor => processor.id);
      expect(ids).toContain('NuxtClientSourceMapErrorFilter');
    });

    it('does not add event processors to the global scope after close()', async () => {
      const globalProcessorCount = getGlobalScope().getScopeData().eventProcessors.length;

      init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });
      await SentryNode.close();
      init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      expect(getGlobalScope().getScopeData().eventProcessors.length).toBe(globalProcessorCount);
    });
  });

  describe('clientSourceMapErrorFilter', () => {
    const options = { debug: false };
    const filter = clientSourceMapErrorFilter(options);

    describe('filters out errors', () => {
      it.each([
        [
          'source map errors with leading /',
          {
            exception: { values: [{ value: "ENOENT: no such file or directory, open '/path/to/_nuxt/file.js.map'" }] },
          },
        ],
        [
          'source map errors without leading /',
          { exception: { values: [{ value: "ENOENT: no such file or directory, open 'path/to/_nuxt/file.js.map'" }] } },
        ],
        [
          'source map errors with long path',
          {
            exception: {
              values: [
                {
                  value:
                    "ENOENT: no such file or directory, open 'path/to/public/_nuxt/public/long/long/path/file.js.map'",
                },
              ],
            },
          },
        ],
      ])('filters out %s', (_, event) => {
        // @ts-expect-error Event type is not correct in tests
        expect(filter(event)).toBeNull();
      });
    });

    describe('does not filter out errors', () => {
      it.each([
        ['other errors', { exception: { values: [{ value: 'Some other error' }] } }],
        ['events with no exceptions', {}],
        [
          'events without _nuxt in path',
          {
            exception: { values: [{ value: "ENOENT: no such file or directory, open '/path/to/other/file.js.map'" }] },
          },
        ],
        [
          'source map errors with different casing',
          {
            exception: { values: [{ value: "ENOENT: No Such file or directory, open '/path/to/_nuxt/file.js.map'" }] },
          },
        ],
        [
          'non-source-map file',
          { exception: { values: [{ value: "ENOENT: no such file or directory, open '/path/to/_nuxt/file.js'" }] } },
        ],
        ['events with no exception values', { exception: { values: [] } }],
        ['events with null exception value', { exception: { values: [null] } }],
      ])('does not filter out %s', (_, event) => {
        // @ts-expect-error Event type is not correct in tests
        expect(filter(event)).toEqual(event);
      });
    });
  });
});
