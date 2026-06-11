import * as SentryCore from '@sentry/core';
import { SDK_VERSION } from '@sentry/core';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { sentry } from '../../src/deno/middleware';
import { init } from '../../src/deno/sdk';
import { LOW_QUALITY_TRANSACTION_PATTERNS } from '../../src/shared/lowQualityTransactionPatterns';

vi.mock('@sentry/deno', () => ({
  init: vi.fn(),
}));

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
const { init: initDenoMock } = await vi.importMock<typeof import('@sentry/deno')>('@sentry/deno');

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    applySdkMetadata: vi.fn(actual.applySdkMetadata),
    getClient: vi.fn(() => undefined),
    // Pass-through so console.warn calls inside consoleSandbox are observable in tests
    consoleSandbox: vi.fn((cb: () => unknown) => cb()),
  };
});

const applySdkMetadataMock = SentryCore.applySdkMetadata as Mock;
const getClientMock = SentryCore.getClient as Mock;

describe('Hono Deno Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sentry middleware', () => {
    it('accepts Hono with custom env types without requiring a cast', () => {
      type CustomEnv = { Bindings: { DATABASE_URL: string }; Variables: { userId: string } };
      const app = new Hono<CustomEnv>();

      const middleware = sentry(app, { dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      expect(typeof middleware).toBe('function');
      expect(middleware).toHaveLength(2);
    });

    it('calls applySdkMetadata with "hono" and "deno"', () => {
      const app = new Hono();
      const options = {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      };

      sentry(app, options);

      expect(applySdkMetadataMock).toHaveBeenCalledTimes(1);
      expect(applySdkMetadataMock).toHaveBeenCalledWith(options, 'hono', ['hono', 'deno']);
    });

    it('calls init from @sentry/deno when no client exists yet', () => {
      getClientMock.mockReturnValue(undefined);
      const app = new Hono();
      const options = {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      };

      sentry(app, options);

      expect(initDenoMock).toHaveBeenCalledTimes(1);
      expect(initDenoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
        }),
      );
    });

    it('sets SDK metadata before calling Deno init', () => {
      const app = new Hono();
      const options = {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      };

      sentry(app, options);

      const applySdkMetadataCallOrder = applySdkMetadataMock.mock.invocationCallOrder[0];
      const initDenoCallOrder = (initDenoMock as Mock).mock.invocationCallOrder[0];

      expect(applySdkMetadataCallOrder).toBeLessThan(initDenoCallOrder as number);
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

      expect(initDenoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          environment: 'production',
          sampleRate: 0.5,
          tracesSampleRate: 1.0,
          debug: true,
        }),
      );
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

    it('returns an async middleware handler', () => {
      const app = new Hono();
      const middleware = sentry(app, {});

      expect(middleware.constructor.name).toBe('AsyncFunction');
    });

    it('passes an integrations function to initDeno (never a raw array)', () => {
      const app = new Hono();
      sentry(app, { dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      const callArgs = (initDenoMock as Mock).mock.calls[0]?.[0];
      expect(typeof callArgs.integrations).toBe('function');
    });

    it('includes hono SDK metadata', () => {
      const app = new Hono();
      const options = {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      };

      sentry(app, options);

      expect(initDenoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          _metadata: expect.objectContaining({
            sdk: expect.objectContaining({
              name: 'sentry.javascript.hono',
              version: SDK_VERSION,
              packages: [
                { name: 'npm:@sentry/hono', version: SDK_VERSION },
                { name: 'npm:@sentry/deno', version: SDK_VERSION },
              ],
            }),
          }),
        }),
      );
    });
  });

  describe('double-init guard', () => {
    it('still calls init even when Sentry is already initialized', () => {
      const fakeClient = { getOptions: () => ({}) };
      getClientMock.mockReturnValue(fakeClient as unknown as SentryCore.Client);

      const app = new Hono();
      sentry(app, { dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      expect(initDenoMock).toHaveBeenCalledTimes(1);
    });

    it('emits a console.warn directing to remove the duplicate init call when Sentry is already initialized', () => {
      const warnSpy = vi.spyOn(console, 'warn');
      const fakeClient = { getOptions: () => ({}) };
      getClientMock.mockReturnValue(fakeClient as unknown as SentryCore.Client);

      const app = new Hono();
      sentry(app, { dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Sentry is already initialized'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Remove the `Sentry.init()` call'));
    });

    it('does not emit a console.warn when no client exists yet', () => {
      const warnSpy = vi.spyOn(console, 'warn');
      getClientMock.mockReturnValue(undefined);

      const app = new Hono();
      sentry(app, { dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('always calls init regardless of whether a client already exists', () => {
      getClientMock.mockReturnValue(undefined);

      init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      expect(initDenoMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('ignoreSpans (low-quality transaction filtering)', () => {
    it('adds default low-quality transaction patterns to ignoreSpans', () => {
      const app = new Hono();
      sentry(app, { dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      const callArgs = (initDenoMock as Mock).mock.calls[0]?.[0];
      expect(callArgs.ignoreSpans).toEqual(expect.arrayContaining(LOW_QUALITY_TRANSACTION_PATTERNS));
    });

    it('preserves user-supplied ignoreSpans and appends defaults', () => {
      const app = new Hono();
      const userPattern = /^GET \/health$/;
      sentry(app, {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        ignoreSpans: [userPattern],
      });

      const callArgs = (initDenoMock as Mock).mock.calls[0]?.[0];
      expect(callArgs.ignoreSpans[0]).toBe(userPattern);
      expect(callArgs.ignoreSpans).toEqual(expect.arrayContaining(LOW_QUALITY_TRANSACTION_PATTERNS));
    });

    it('handles undefined ignoreSpans gracefully', () => {
      const app = new Hono();
      sentry(app, { dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      const callArgs = (initDenoMock as Mock).mock.calls[0]?.[0];
      expect(callArgs.ignoreSpans).toHaveLength(LOW_QUALITY_TRANSACTION_PATTERNS.length);
    });
  });
});
