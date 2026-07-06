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

  test('installs SpanStreaming integration when traceLifecycle is "stream"', () => {
    init({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      traceLifecycle: 'stream',
    });
    const client = getClient();

    expect(client?.getOptions()).toEqual(
      expect.objectContaining({
        integrations: expect.arrayContaining([expect.objectContaining({ name: 'SpanStreaming' })]),
      }),
    );
  });

  test("does not install SpanStreaming integration when traceLifecycle is not 'stream'", () => {
    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });
    const client = getClient();

    expect(client?.getOptions()).toEqual(
      expect.objectContaining({
        integrations: expect.not.arrayContaining([expect.objectContaining({ name: 'SpanStreaming' })]),
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
    globalThis.__SENTRY_ORCHESTRION__ = { bundler: true };

    const names = getDefaultIntegrations({}).map(i => i.name);

    expect(names).not.toContain('Mysql');
    expect(names).not.toContain('Postgres');
    expect(names).not.toContain('LruMemoizer');
  });

  test('adds orchestrion channel integrations registered by the injected registration module', async () => {
    // Import the actual registration module the vite plugin injects into bundles.
    await import('../src/orchestrion');

    const names = getDefaultIntegrations({}).map(i => i.name);

    expect(names).toContain('Mysql');
    expect(names).toContain('Postgres');
    expect(names).toContain('LruMemoizer');
  });
});
