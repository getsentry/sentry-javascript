import * as SentryCore from '@sentry/core';
import type { Integration } from '@sentry/core';
import { getClient } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
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
