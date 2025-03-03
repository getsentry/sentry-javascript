import { describe, expect, it, vi } from 'vitest';
import { initCloudflareSentryHandle } from '../../src/worker';

import * as SentryCloudflare from '@sentry/cloudflare';
import { beforeEach } from 'node:test';
import type { Carrier, GLOBAL_OBJ } from '@sentry/core';
import { platform } from 'os';

const globalWithSentry = globalThis as typeof GLOBAL_OBJ & Carrier;

describe('initCloudflareSentryHandle', () => {
  beforeEach(() => {
    delete globalWithSentry.__SENTRY__;
  });

  it('sets the async context strategy when called', () => {
    vi.spyOn(SentryCloudflare, 'setAsyncLocalStorageAsyncContextStrategy');

    initCloudflareSentryHandle({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

    expect(SentryCloudflare.setAsyncLocalStorageAsyncContextStrategy).toHaveBeenCalledTimes(1);
    expect(
      globalWithSentry.__SENTRY__ && globalWithSentry.__SENTRY__[globalWithSentry.__SENTRY__?.version || '']?.acs,
    ).toBeDefined();
  });

  it('calls wrapRequestHandler with the correct arguments', async () => {
    const options = { dsn: 'https://public@dsn.ingest.sentry.io/1337' };
    const request = { foo: 'bar' };
    const context = { bar: 'baz' };

    const event = { request, platform: { context } };
    const resolve = vi.fn(() => Promise.resolve({}));

    // @ts-expect-error - resolving an empty object is enough for this test
    vi.spyOn(SentryCloudflare, 'wrapRequestHandler').mockImplementationOnce((_, cb) => cb());

    const handle = initCloudflareSentryHandle(options);

    // @ts-expect-error - only passing a partial event object
    await handle({ event, resolve });

    expect(SentryCloudflare.wrapRequestHandler).toHaveBeenCalledTimes(1);
    expect(SentryCloudflare.wrapRequestHandler).toHaveBeenCalledWith(
      { options: expect.objectContaining({ dsn: options.dsn }), request, context },
      expect.any(Function),
    );

    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('skips request isolation on subsequent sentry handlers', async () => {
    const options = { dsn: 'https://public@dsn.ingest.sentry.io/1337' };
    const request = { foo: 'bar' };
    const context = { bar: 'baz' };
    const locals = {};

    const event = { request, platform: { context }, locals };
    const resolve = vi.fn(() => Promise.resolve({}));

    // @ts-expect-error - resolving an empty object is enough for this test
    vi.spyOn(SentryCloudflare, 'wrapRequestHandler').mockImplementationOnce((_, cb) => cb());

    const handle = initCloudflareSentryHandle(options);

    // @ts-expect-error - only passing a partial event object
    await handle({ event, resolve });

    // @ts-expect-error - this property exists if the handler resolved correctly.
    expect(locals._sentrySkipRequestIsolation).toBe(true);
  });

  it('falls back to resolving the event, if no platform data is set', async () => {
    const options = { dsn: 'https://public@dsn.ingest.sentry.io/1337' };
    const request = { foo: 'bar' };

    const event = { request };
    const resolve = vi.fn(() => Promise.resolve({}));

    // @ts-expect-error - resolving an empty object is enough for this test
    vi.spyOn(SentryCloudflare, 'wrapRequestHandler').mockImplementationOnce((_, cb) => cb());

    const handle = initCloudflareSentryHandle(options);

    // @ts-expect-error - only passing a partial event object
    await handle({ event, resolve });

    expect(SentryCloudflare.wrapRequestHandler).not.toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});
