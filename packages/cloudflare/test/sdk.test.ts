import * as SentryCore from '@sentry/core';
import type { Envelope, Integration } from '@sentry/core';
import { getClient } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { CloudflareOptions } from '../src/client';
import { CloudflareClient } from '../src/client';
import { getDefaultIntegrations, init } from '../src/sdk';
import { resetSdk } from './testUtils';
import { spanStreamingIntegration } from '../src/';

describe('init', () => {
  beforeEach(() => {
    resetSdk();
  });

  test('should call initAndBind with the correct options', () => {
    const initAndBindSpy = vi.spyOn(SentryCore, 'initAndBind');
    const client = init({});

    expect(initAndBindSpy).toHaveBeenCalledWith(CloudflareClient, expect.any(Object));

    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(CloudflareClient);
  });

  test('installs SpanStreaming integration by default', () => {
    init({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    });
    const client = getClient();

    expect(client?.getOptions()).toEqual(
      expect.objectContaining({
        integrations: expect.arrayContaining([expect.objectContaining({ name: 'SpanStreaming' })]),
      }),
    );
  });

  test("does not install SpanStreaming integration when traceLifecycle is 'static'", () => {
    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', traceLifecycle: 'static' });
    const client = getClient();

    expect(client?.getOptions()).toEqual(
      expect.objectContaining({
        integrations: expect.not.arrayContaining([expect.objectContaining({ name: 'SpanStreaming' })]),
      }),
    );
  });

  test('installs Dedupe integration by default', () => {
    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });
    const client = getClient();

    expect(client?.getOptions()).toEqual(
      expect.objectContaining({
        integrations: expect.arrayContaining([expect.objectContaining({ name: 'Dedupe' })]),
      }),
    );
  });

  test('does not install Dedupe integration when enableDedupe is false', () => {
    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', enableDedupe: false });
    const client = getClient();

    expect(client?.getOptions()).toEqual(
      expect.objectContaining({
        integrations: expect.not.arrayContaining([expect.objectContaining({ name: 'Dedupe' })]),
      }),
    );
  });

  type MarkedIntegration = Integration & { _custom?: boolean };

  test("doesn't add spanStreamingIntegration if user added it manually", () => {
    const customSpanStreamingIntegration: MarkedIntegration = spanStreamingIntegration();
    customSpanStreamingIntegration._custom = true;

    const client = init({ integrations: [customSpanStreamingIntegration], traceLifecycle: 'stream' });
    const integrations = client?.getOptions().integrations.filter(i => i.name === 'SpanStreaming');

    expect(integrations?.length).toBe(1);
    expect((integrations?.[0] as MarkedIntegration)?._custom).toBe(true);
  });
});

describe('cacheClient', () => {
  beforeEach(() => {
    resetSdk();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const TEST_ENVELOPE = [
    { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '2023-05-31T12:00:00.000Z' },
    [[{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }]],
  ] as Envelope;

  test('returns the same client for repeated init with identical options', () => {
    const options = {
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    } as const;

    const first = init({ ...options });
    const second = init({ ...options });

    expect(second).toBe(first);
  });

  test('returns the isolate client when later init options differ', () => {
    const first = init({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tracesSampleRate: 0.5,
    });
    const second = init({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tracesSampleRate: 1,
    });

    expect(second).toBe(first);
  });

  test('re-binds the cached client to the current scope on repeated init', () => {
    const options = {
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    } as const;

    const cached = init({ ...options });

    // Simulate a competing init leaving a different client bound to the scope
    SentryCore.getCurrentScope().setClient(undefined);
    expect(getClient()).toBeUndefined();

    const again = init({ ...options });
    expect(again).toBe(cached);
    expect(getClient()).toBe(cached);
  });

  test('creates a fresh client when the cached one was disposed', () => {
    const options = {
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    } as const;

    const cached = init({ ...options });
    cached?.dispose();

    const again = init({ ...options });
    expect(again).toBeDefined();
    expect(again).not.toBe(cached);
    expect(again?.getTransport()).toBeDefined();
  });

  test('flushes eagerly when an envelope is sent on a cached client', async () => {
    // The eager drain fires the buffered fetch, so stub out the network
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok')));

    const client = init({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    });

    const transport = client?.getTransport();
    expect(transport).toBeDefined();

    const flushSpy = vi.spyOn(transport!, 'flush');
    await client!.sendEnvelope(TEST_ENVELOPE);

    expect(flushSpy).toHaveBeenCalled();
  });

  test('does not flush eagerly when cacheClient is disabled', async () => {
    const client = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', cacheClient: false });

    const transport = client?.getTransport();
    expect(transport).toBeDefined();

    const flushSpy = vi.spyOn(transport!, 'flush');
    await client!.sendEnvelope(TEST_ENVELOPE);

    expect(flushSpy).not.toHaveBeenCalled();
  });

  // Logs and metrics batch client-side and the idle drain timer is disabled for this
  // runtime, so unlike an event a capture alone never produces an envelope. A cached
  // client never reaches an invocation-boundary flush, so without an eager drain these
  // are dropped entirely — and silently, since errors keep working.
  describe('log and metric delivery', () => {
    function initWithCapturingTransport(options: Partial<CloudflareOptions> = {}) {
      const envelopes: Envelope[] = [];
      const client = init({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        enableLogs: true,
        transport: () => ({
          send: (envelope: Envelope) => {
            envelopes.push(envelope);
            return Promise.resolve({});
          },
          flush: () => Promise.resolve(true),
        }),
        ...options,
      })!;

      return { client, envelopes };
    }

    const itemTypes = (envelopes: Envelope[]): string[] =>
      envelopes.map(envelope => (envelope[1]?.[0]?.[0] as { type: string })?.type);

    test('delivers a log captured on a cached client without an explicit flush', async () => {
      const { envelopes } = initWithCapturingTransport();

      SentryCore.logger.info('detached log');
      await vi.waitFor(() => expect(itemTypes(envelopes)).toContain('log'));
    });

    test('delivers a metric captured on a cached client without an explicit flush', async () => {
      const { envelopes } = initWithCapturingTransport();

      SentryCore.metrics.count('detached_metric', 1);
      await vi.waitFor(() => expect(itemTypes(envelopes)).toContain('trace_metric'));
    });

    test('coalesces a synchronous burst of logs into a single envelope', async () => {
      const { envelopes } = initWithCapturingTransport();

      for (let i = 0; i < 5; i++) {
        SentryCore.logger.info(`burst ${i}`);
      }

      await vi.waitFor(() => expect(itemTypes(envelopes)).toContain('log'));
      expect(itemTypes(envelopes).filter(type => type === 'log')).toHaveLength(1);
    });

    test('keeps batching logs until flush for a non-cached client', async () => {
      const { client, envelopes } = initWithCapturingTransport({ cacheClient: false });

      SentryCore.logger.info('batched log');
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(envelopes).toHaveLength(0);

      await client.flush(0);
      expect(itemTypes(envelopes)).toContain('log');
    });

    test('flush() delivers buffered logs on a cached client', async () => {
      const { client, envelopes } = initWithCapturingTransport();

      SentryCore.logger.info('tail log');
      await client.flush(0);

      expect(itemTypes(envelopes)).toContain('log');
    });
  });

  test('does not instrument ctx.waitUntil with the flush lock for cached clients', () => {
    const waitUntil = vi.fn();
    const context = { waitUntil, passThroughOnException: vi.fn() };

    init({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      ctx: context,
    });

    expect(context.waitUntil).toBe(waitUntil);
  });

  test('instruments ctx.waitUntil with the flush lock for non-cached clients', () => {
    const waitUntil = vi.fn();
    const context = { waitUntil, passThroughOnException: vi.fn() };

    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', cacheClient: false, ctx: context });

    expect(context.waitUntil).not.toBe(waitUntil);
  });
});

describe('getDefaultIntegrations', () => {
  afterEach(() => {
    delete globalThis.__SENTRY_ORCHESTRION__;
  });

  test('does not add orchestrion channel integrations when none were registered', () => {
    delete globalThis.__SENTRY_ORCHESTRION__;

    const names = getDefaultIntegrations({}).map(i => i.name);

    expect(names).not.toContain('Mysql');
    expect(names).not.toContain('Postgres');
    expect(names).not.toContain('LruMemoizer');
  });

  test('does not add orchestrion channel integrations when only the bundler marker is set', () => {
    // The plugin's entry banner ran, but no instrumented module has loaded yet.
    globalThis.__SENTRY_ORCHESTRION__ = { bundler: [] };

    const names = getDefaultIntegrations({}).map(i => i.name);

    expect(names).not.toContain('Mysql');
    expect(names).not.toContain('Postgres');
    expect(names).not.toContain('LruMemoizer');
  });

  test('adds orchestrion channel integrations registered on the marker by injected modules', async () => {
    // Mirror what the snippet the vite plugin injects into each instrumented
    // module does at runtime: import its factory and `.set` it on the marker map,
    // keyed by module name (so a package split across files registers once).
    const { mysqlIntegration, postgresIntegration, lruMemoizerIntegration } = await import('@sentry/server-utils');
    globalThis.__SENTRY_ORCHESTRION__ = {
      bundler: ['mysql', 'pg', 'lru-memoizer'],
      integrations: new Map([
        ['mysql', mysqlIntegration],
        ['pg', postgresIntegration],
        ['lru-memoizer', lruMemoizerIntegration],
      ]),
    };

    const names = getDefaultIntegrations({}).map(i => i.name);

    expect(names).toContain('Mysql');
    expect(names).toContain('Postgres');
    expect(names).toContain('LruMemoizer');
  });

  test('installs an integration registered after init via the module-injected event', async () => {
    const { mysqlIntegration } = await import('@sentry/server-utils');
    const client = init({});
    expect(client?.getIntegrationByName('Mysql')).toBeUndefined();

    // Mirror `orchestrionModuleInjected` for a driver that first evaluates
    // after init: store the factory on the marker, then emit the event.
    globalThis.__SENTRY_ORCHESTRION__ = {
      bundler: ['mysql'],
      integrations: new Map([['mysql', mysqlIntegration]]),
    };
    client?.emit('orchestrion.module-injected', 'mysql');

    expect(client?.getIntegrationByName('Mysql')).toBeDefined();
  });
});
