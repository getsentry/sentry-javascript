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
    it('calls applySdkMetadata with "hono"', () => {
      const app = new Hono();
      const options = {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      };

      sentry(app, options);

      expect(applySdkMetadataMock).toHaveBeenCalledTimes(1);
      expect(applySdkMetadataMock).toHaveBeenCalledWith(options, 'hono');
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
      ]);
    });

    it('calls applySdkMetadata before withSentry', () => {
      const app = new Hono();
      const options = {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      };

      sentry(app, options);

      // Verify applySdkMetadata was called before withSentry
      const applySdkMetadataCallOrder = applySdkMetadataMock.mock.invocationCallOrder[0];
      const withSentryCallOrder = withSentryMock.mock.invocationCallOrder[0];

      expect(applySdkMetadataCallOrder).toBeLessThan(withSentryCallOrder as number);
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
  });
});
