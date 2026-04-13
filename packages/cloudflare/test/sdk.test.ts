import type { Integration } from '@sentry/core';
import { getClient } from '@sentry/core';
import { getGlobalScope } from '@sentry/core';
import { beforeEach, describe, expect, test } from 'vitest';
import { CloudflareClient } from '../src/client';
import { init } from '../src/sdk';
import { resetSdk } from './testUtils';
import { spanStreamingIntegration } from '../src/';

describe('init', () => {
  beforeEach(() => {
    resetSdk();
  });

  test('should create a CloudflareClient and set it on the global scope', () => {
    const client = init({});

    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(CloudflareClient);
    expect(getGlobalScope().getClient()).toBe(client);
  });

  test('should reuse existing client from global scope', () => {
    const client1 = init({});
    const client2 = init({});

    expect(client1).toBe(client2);
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
