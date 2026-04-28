import * as SentryCore from '@sentry/core';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sentry } from '../../src/node/middleware';
import { init } from '../../src/node/sdk';

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
}));

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
const { init: initNodeMock } = await vi.importMock<typeof import('@sentry/node')>('@sentry/node');

describe('Hono Node Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sentry middleware (external init)', () => {
    it('does not call init', () => {
      const app = new Hono();
      sentry(app);

      expect(initNodeMock).not.toHaveBeenCalled();
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

    it('emits a warning when Sentry is not initialized', () => {
      const warnSpy = vi.spyOn(SentryCore.debug, 'warn');
      vi.spyOn(SentryCore, 'getClient').mockReturnValue(undefined);

      const app = new Hono();
      sentry(app);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Sentry is not initialized'));
    });

    it('does not emit a warning when Sentry is already initialized', () => {
      const warnSpy = vi.spyOn(SentryCore.debug, 'warn');
      const fakeClient = { getOptions: () => ({ debug: false }) };
      vi.spyOn(SentryCore, 'getClient').mockReturnValue(fakeClient as unknown as SentryCore.Client);

      const app = new Hono();
      sentry(app);

      expect(warnSpy).not.toHaveBeenCalled();
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
