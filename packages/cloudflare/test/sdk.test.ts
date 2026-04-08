import * as SentryCore from '@sentry/core';
import { getClient } from '@sentry/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CloudflareClient } from '../src/client';
import { init } from '../src/sdk';
import { resetSdk } from './testUtils';

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
});
