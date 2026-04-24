import * as SentryCore from '@sentry/core';
import { SDK_VERSION } from '@sentry/core';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { sentry } from '../../src/node/middleware';
import { init } from '../../src/node/sdk';

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
}));

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
const { init: initNodeMock } = await vi.importMock<typeof import('@sentry/node')>('@sentry/node');

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    applySdkMetadata: vi.fn(actual.applySdkMetadata),
  };
});

const applySdkMetadataMock = SentryCore.applySdkMetadata as Mock;

describe('Hono Node Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sentry middleware with options (inline init)', () => {
    it('calls applySdkMetadata with "hono"', () => {
      const app = new Hono();
      const options = {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      };

      sentry(app, options);

      expect(applySdkMetadataMock).toHaveBeenCalledTimes(1);
      expect(applySdkMetadataMock).toHaveBeenCalledWith(options, 'hono', ['hono', 'node']);
    });

    it('calls init from @sentry/node', () => {
      const app = new Hono();
      const options = {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      };

      sentry(app, options);

      expect(initNodeMock).toHaveBeenCalledTimes(1);
      expect(initNodeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
        }),
      );
    });

    it('sets SDK metadata before calling Node init', () => {
      const app = new Hono();
      const options = {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      };

      sentry(app, options);

      const applySdkMetadataCallOrder = applySdkMetadataMock.mock.invocationCallOrder[0];
      const initNodeCallOrder = (initNodeMock as Mock).mock.invocationCallOrder[0];

      expect(applySdkMetadataCallOrder).toBeLessThan(initNodeCallOrder as number);
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

      expect(initNodeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          environment: 'production',
          sampleRate: 0.5,
          tracesSampleRate: 1.0,
          debug: true,
        }),
      );
    });

    it('passes an integrations function to initNode (never a raw array)', () => {
      const app = new Hono();
      sentry(app, { dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      const callArgs = (initNodeMock as Mock).mock.calls[0]?.[0];
      expect(typeof callArgs.integrations).toBe('function');
    });

    it('includes hono SDK metadata', () => {
      const app = new Hono();
      const options = {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      };

      sentry(app, options);

      expect(initNodeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          _metadata: expect.objectContaining({
            sdk: expect.objectContaining({
              name: 'sentry.javascript.hono',
              version: SDK_VERSION,
              packages: [
                { name: 'npm:@sentry/hono', version: SDK_VERSION },
                { name: 'npm:@sentry/node', version: SDK_VERSION },
              ],
            }),
          }),
        }),
      );
    });
  });

  describe('sentry middleware without options (external init)', () => {
    it('does not call init when no options are provided', () => {
      const app = new Hono();
      sentry(app);

      expect(initNodeMock).not.toHaveBeenCalled();
      expect(applySdkMetadataMock).not.toHaveBeenCalled();
    });

    it('returns a middleware handler function', () => {
      const app = new Hono();
      const middleware = sentry(app);

      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
      expect(middleware).toHaveLength(2);
    });

    it('returns an async middleware handler', () => {
      const app = new Hono();
      const middleware = sentry(app);

      expect(middleware.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('common behavior', () => {
    it('returns a middleware handler function when options are provided', () => {
      const app = new Hono();
      const middleware = sentry(app, { dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
      expect(middleware).toHaveLength(2);
    });

    it('returns an async middleware handler when options are provided', () => {
      const app = new Hono();
      const middleware = sentry(app, {});

      expect(middleware.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('double-init guard', () => {
    it('skips re-initialization when a client already exists', () => {
      const fakeClient = { getOptions: () => ({}) };
      const getClientSpy = vi
        .spyOn(SentryCore, 'getClient')
        .mockReturnValue(fakeClient as unknown as SentryCore.Client);

      const result = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      expect(result).toBe(fakeClient);
      expect(initNodeMock).not.toHaveBeenCalled();
      expect(applySdkMetadataMock).not.toHaveBeenCalled();

      getClientSpy.mockRestore();
    });

    it('initializes normally when no client exists yet', () => {
      const getClientSpy = vi.spyOn(SentryCore, 'getClient').mockReturnValue(undefined);

      init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      expect(initNodeMock).toHaveBeenCalledTimes(1);

      getClientSpy.mockRestore();
    });
  });
});
