import {
  CLIENT_ADDRESS,
  CLIENT_PORT,
  NETWORK_PEER_ADDRESS,
  NETWORK_PEER_PORT,
  NETWORK_TRANSPORT,
  NETWORK_TYPE,
} from '@sentry/conventions/attributes';
import * as SentryCore from '@sentry/core';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { sentry } from '../../src/node/middleware';
import { init } from '../../src/node/sdk';
import { requestConnInfoAttributes } from '../shared/requestConnInfoAttributes';

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
      const getActiveClientSpy = vi
        .spyOn(SentryCore, '_INTERNAL_getActiveClient')
        .mockReturnValue(fakeClient as unknown as SentryCore.Client);

      const result = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      expect(result).toBe(fakeClient);
      expect(initNodeMock).not.toHaveBeenCalled();

      getActiveClientSpy.mockRestore();
    });

    it('initializes normally when no client exists yet', () => {
      const getActiveClientSpy = vi.spyOn(SentryCore, '_INTERNAL_getActiveClient').mockReturnValue(undefined);

      init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      expect(initNodeMock).toHaveBeenCalledTimes(1);

      getActiveClientSpy.mockRestore();
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
      const getActiveClientSpy = vi
        .spyOn(SentryCore, '_INTERNAL_getActiveClient')
        .mockReturnValue(fakeClient as unknown as SentryCore.Client);

      const result = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      expect(result).toBe(fakeClient);
      expect(initNodeMock).not.toHaveBeenCalled();
      expect(applySdkMetadataMock).not.toHaveBeenCalled();

      getActiveClientSpy.mockRestore();
    });

    it('initializes normally when no client exists yet', () => {
      const getActiveClientSpy = vi.spyOn(SentryCore, '_INTERNAL_getActiveClient').mockReturnValue(undefined);

      init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      expect(initNodeMock).toHaveBeenCalledTimes(1);

      getActiveClientSpy.mockRestore();
    });
  });
});

describe('Hono Node Middleware — connection info', () => {
  it('reads the socket of the incoming message', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const middleware = sentry(new Hono());
    consoleWarnSpy.mockRestore();
    // The `env` that `@hono/node-server` passes to `app.fetch`.
    const env = { incoming: { socket: { remoteAddress: '203.0.113.5', remotePort: 54321, remoteFamily: 'IPv4' } } };

    const attributes = await requestConnInfoAttributes(middleware, { env });

    expect(attributes[CLIENT_ADDRESS]).toBe('203.0.113.5');
    expect(attributes[CLIENT_PORT]).toBe(54321);
    expect(attributes[NETWORK_PEER_ADDRESS]).toBe('203.0.113.5');
    expect(attributes[NETWORK_PEER_PORT]).toBe(54321);
    expect(attributes[NETWORK_TYPE]).toBe('ipv4');
    expect(attributes).not.toHaveProperty(NETWORK_TRANSPORT);
  });
});
