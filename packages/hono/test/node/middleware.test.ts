import * as SentryCore from '@sentry/core';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { sentry } from '../../src/node/middleware';
import { init } from '../../src/node/sdk';

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
}));

vi.mock('@hono/node-server/conninfo', () => ({
  getConnInfo: vi.fn(() => ({ remote: {} })),
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

  describe('sentry middleware (external init)', () => {
    it('does not call init', () => {
      const app = new Hono();
      sentry(app);

      expect(initNodeMock).not.toHaveBeenCalled();
    });

    it('accepts Hono with custom env types without requiring a cast', () => {
      type CustomEnv = { Bindings: { DATABASE_URL: string }; Variables: { userId: string } };
      const app = new Hono<CustomEnv>();

      const middleware = sentry(app);

      expect(typeof middleware).toBe('function');
      expect(middleware).toHaveLength(2);
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

    it('emits a console.warn when Sentry is not initialized', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      vi.spyOn(SentryCore, 'getClient').mockReturnValue(undefined);

      const app = new Hono();
      sentry(app);

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Sentry is not initialized'));
      consoleWarnSpy.mockRestore();
    });

    it('does not emit a warning when Sentry is already initialized with @sentry/hono/node', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const fakeClient = {
        getOptions: () => ({
          debug: false,
          _metadata: { sdk: { name: 'sentry.javascript.hono' } },
        }),
      };
      vi.spyOn(SentryCore, 'getClient').mockReturnValue(fakeClient as unknown as SentryCore.Client);

      const app = new Hono();
      sentry(app);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });

    it('emits a console.warn when Sentry is initialized with @sentry/node instead of @sentry/hono/node', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const fakeClient = {
        getOptions: () => ({
          debug: false,
          _metadata: { sdk: { name: 'sentry.javascript.node' } },
        }),
      };
      vi.spyOn(SentryCore, 'getClient').mockReturnValue(fakeClient as unknown as SentryCore.Client);

      const app = new Hono();
      sentry(app);

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('not initialized with `@sentry/hono/node`'));
      consoleWarnSpy.mockRestore();
    });

    it('emits a console.warn when Sentry is initialized without any SDK metadata', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const fakeClient = { getOptions: () => ({ debug: false }) };
      vi.spyOn(SentryCore, 'getClient').mockReturnValue(fakeClient as unknown as SentryCore.Client);

      const app = new Hono();
      sentry(app);

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('not initialized with `@sentry/hono/node`'));
      consoleWarnSpy.mockRestore();
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

    it('emits a console.warn when Sentry is not initialized', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      vi.spyOn(SentryCore, 'getClient').mockReturnValue(undefined);

      const app = new Hono();
      sentry(app);

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Sentry is not initialized'));
      consoleWarnSpy.mockRestore();
    });

    it('does not emit a warning when Sentry is already initialized with @sentry/hono/node', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const fakeClient = {
        getOptions: () => ({
          debug: false,
          _metadata: { sdk: { name: 'sentry.javascript.hono' } },
        }),
      };
      vi.spyOn(SentryCore, 'getClient').mockReturnValue(fakeClient as unknown as SentryCore.Client);

      const app = new Hono();
      const middleware = sentry(app);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(middleware.constructor.name).toBe('AsyncFunction');
      consoleWarnSpy.mockRestore();
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
