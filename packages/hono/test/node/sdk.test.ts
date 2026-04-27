import * as SentryCore from '@sentry/core';
import { SDK_VERSION } from '@sentry/core';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { init } from '../../src/node/sdk';

vi.mock('@sentry/node', () => ({
  init: vi.fn().mockReturnValue({ /* fake client returned by node init */ }),
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

describe('Hono Node SDK – init()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(SentryCore, 'getClient').mockReturnValue(undefined);
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  it('calls applySdkMetadata with the correct SDK identifiers', () => {
    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

    expect(applySdkMetadataMock).toHaveBeenCalledTimes(1);
    expect(applySdkMetadataMock).toHaveBeenCalledWith(
      expect.any(Object),
      'hono',
      ['hono', 'node'],
    );
  });

  it('calls @sentry/node init with the provided DSN', () => {
    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

    expect(initNodeMock).toHaveBeenCalledTimes(1);
    expect(initNodeMock).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://public@dsn.ingest.sentry.io/1337' }),
    );
  });

  it('applies SDK metadata before calling @sentry/node init', () => {
    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

    const metaOrder = applySdkMetadataMock.mock.invocationCallOrder[0];
    const initOrder = (initNodeMock as Mock).mock.invocationCallOrder[0];

    expect(metaOrder).toBeLessThan(initOrder as number);
  });

  it('attaches correct SDK metadata (name, version, packages)', () => {
    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

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

  it('preserves all user-supplied options', () => {
    init({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      environment: 'production',
      sampleRate: 0.5,
      tracesSampleRate: 1.0,
      debug: true,
    });

    expect(initNodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'production',
        sampleRate: 0.5,
        tracesSampleRate: 1.0,
        debug: true,
      }),
    );
  });

  it('always passes integrations as a function, never a raw array', () => {
    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

    const callArgs = (initNodeMock as Mock).mock.calls[0]?.[0];
    expect(typeof callArgs.integrations).toBe('function');
  });

  it('wraps a user-supplied integrations array into a function', () => {
    const userIntegration = { name: 'MyIntegration', setupOnce: vi.fn() };
    init({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      integrations: [userIntegration],
    });

    const callArgs = (initNodeMock as Mock).mock.calls[0]?.[0];
    expect(typeof callArgs.integrations).toBe('function');
  });

  it('wraps a user-supplied integrations factory into a function', () => {
    const factory = vi.fn((defaults: SentryCore.Integration[]) => defaults);
    init({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      integrations: factory,
    });

    const callArgs = (initNodeMock as Mock).mock.calls[0]?.[0];
    expect(typeof callArgs.integrations).toBe('function');
  });

  it('returns the value produced by @sentry/node init', () => {
    const fakeClient = { getOptions: () => ({}) };
    (initNodeMock as Mock).mockReturnValueOnce(fakeClient as unknown as SentryCore.Client);

    const result = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

    expect(result).toBe(fakeClient);
  });

  // ─── Double-init guard ─────────────────────────────────────────────────────

  it('returns the existing client without re-initializing when already set up', () => {
    const existingClient = { getOptions: () => ({ debug: false }) };
    vi.spyOn(SentryCore, 'getClient').mockReturnValue(existingClient as unknown as SentryCore.Client);

    const result = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

    expect(result).toBe(existingClient);
    expect(initNodeMock).not.toHaveBeenCalled();
    expect(applySdkMetadataMock).not.toHaveBeenCalled();
  });

  it('logs a debug message when skipping re-initialization', () => {
    const logSpy = vi.spyOn(SentryCore.debug, 'log');
    const existingClient = { getOptions: () => ({ debug: true }) };
    vi.spyOn(SentryCore, 'getClient').mockReturnValue(existingClient as unknown as SentryCore.Client);

    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('already initialized'));
  });

  it('does not log when debug is false and skipping re-initialization', () => {
    const logSpy = vi.spyOn(SentryCore.debug, 'log');
    const existingClient = { getOptions: () => ({ debug: false }) };
    vi.spyOn(SentryCore, 'getClient').mockReturnValue(existingClient as unknown as SentryCore.Client);

    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('proceeds with initialization when no client exists', () => {
    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

    expect(initNodeMock).toHaveBeenCalledTimes(1);
    expect(applySdkMetadataMock).toHaveBeenCalledTimes(1);
  });
});

