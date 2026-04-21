import * as SentryCloudflare from '@sentry/cloudflare';
import * as SentryCore from '@sentry/core';
import { SDK_VERSION } from '@sentry/core';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { sentry } from '../../src/cloudflare/middleware';

vi.mock('@sentry/cloudflare', { spy: true });
vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    applySdkMetadata: vi.fn(actual.applySdkMetadata),
  };
});

const withSentryMock = SentryCloudflare.withSentry as Mock;
const applySdkMetadataMock = SentryCore.applySdkMetadata as Mock;

describe('Hono Cloudflare Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sentry middleware', () => {
    it('calls applySdkMetadata with "hono" when the options callback is invoked', () => {
      const app = new Hono();
      const options = {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      };

      sentry(app, options);

      const optionsCallback = withSentryMock.mock.calls[0]?.[0];
      optionsCallback();

      expect(applySdkMetadataMock).toHaveBeenCalledTimes(1);
      expect(applySdkMetadataMock).toHaveBeenCalledWith(options, 'hono', ['hono', 'cloudflare']);
    });

    it('calls withSentry with modified options', () => {
      const app = new Hono();
      const options = {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      };

      sentry(app, options);

      expect(withSentryMock).toHaveBeenCalledTimes(1);
      expect(withSentryMock).toHaveBeenCalledWith(expect.any(Function), app);

      // Get the options callback and call it
      const optionsCallback = withSentryMock.mock.calls[0]?.[0];
      expect(optionsCallback).toBeInstanceOf(Function);

      const result = optionsCallback();

      // After applySdkMetadata is called, options should have _metadata.sdk
      expect(result.dsn).toBe('https://public@dsn.ingest.sentry.io/1337');
      expect(result._metadata?.sdk?.name).toBe('sentry.javascript.hono');
      expect(result._metadata?.sdk?.version).toBe(SDK_VERSION);
      expect(result._metadata?.sdk?.packages).toEqual([
        {
          name: 'npm:@sentry/hono',
          version: SDK_VERSION,
        },
        {
          name: 'npm:@sentry/cloudflare',
          version: SDK_VERSION,
        },
      ]);
    });

    it('preserves all user options', () => {
      const app = new Hono();
      const options = {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        environment: 'production',
        sampleRate: 0.5,
        tracesSampleRate: 1.0,
        debug: true,
      };

      sentry(app, options);

      const optionsCallback = withSentryMock.mock.calls[0]?.[0];
      const result = optionsCallback();

      expect(result).toMatchObject({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        environment: 'production',
        sampleRate: 0.5,
        tracesSampleRate: 1.0,
        debug: true,
      });
    });

    it('returns a middleware handler function', () => {
      const app = new Hono();
      const options = {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      };

      const middleware = sentry(app, options);

      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
      expect(middleware).toHaveLength(2); // Hono middleware takes (context, next)
    });

    it('returns an async middleware handler', async () => {
      const app = new Hono();
      const middleware = sentry(app, {});

      expect(middleware.constructor.name).toBe('AsyncFunction');
    });

    describe('when options is a function (env callback)', () => {
      it('calls the options function with the env argument passed by withSentry', () => {
        type Bindings = { SENTRY_DSN: string };
        const app = new Hono<{ Bindings: Bindings }>();
        const mockEnv: Bindings = { SENTRY_DSN: 'https://public@dsn.ingest.sentry.io/1337' };
        const optionsFn = vi.fn((env: Bindings) => ({ dsn: env.SENTRY_DSN }));

        sentry(app, optionsFn);

        const optionsCallback = withSentryMock.mock.calls[0]?.[0];
        optionsCallback(mockEnv);

        expect(optionsFn).toHaveBeenCalledTimes(1);
        expect(optionsFn).toHaveBeenCalledWith(mockEnv);
      });

      it('uses the return value of the options function as configuration', () => {
        type Bindings = { SENTRY_DSN: string };
        const app = new Hono<{ Bindings: Bindings }>();
        const mockEnv: Bindings = { SENTRY_DSN: 'https://public@dsn.ingest.sentry.io/1337' };

        sentry(app, (env: Bindings) => ({ dsn: env.SENTRY_DSN, environment: 'production' }));

        const optionsCallback = withSentryMock.mock.calls[0]?.[0];
        const result = optionsCallback(mockEnv);

        expect(result.dsn).toBe('https://public@dsn.ingest.sentry.io/1337');
        expect(result.environment).toBe('production');
      });

      it('calls applySdkMetadata with the options object returned by the function', () => {
        type Bindings = { SENTRY_DSN: string };
        const app = new Hono<{ Bindings: Bindings }>();
        const mockEnv: Bindings = { SENTRY_DSN: 'https://public@dsn.ingest.sentry.io/1337' };
        const returnedOptions = { dsn: 'https://public@dsn.ingest.sentry.io/1337' };
        const optionsFn = vi.fn(() => returnedOptions);

        sentry(app, optionsFn);

        const optionsCallback = withSentryMock.mock.calls[0]?.[0];
        optionsCallback(mockEnv);

        expect(applySdkMetadataMock).toHaveBeenCalledTimes(1);
        expect(applySdkMetadataMock).toHaveBeenCalledWith(returnedOptions, 'hono', ['hono', 'cloudflare']);
      });
    });
  });
});
