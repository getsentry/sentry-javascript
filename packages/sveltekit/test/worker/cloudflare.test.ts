import { beforeEach } from 'node:test';
import * as SentryCloudflare from '@sentry/cloudflare';
import type { Carrier, GLOBAL_OBJ } from '@sentry/core';
import { describe, expect, it, vi } from 'vitest';
import { initCloudflareSentryHandle } from '../../src/worker';

const globalWithSentry = globalThis as typeof GLOBAL_OBJ & Carrier;

function getHandlerInput() {
  const options = { dsn: 'https://public@dsn.ingest.sentry.io/1337' };
  const request = { foo: 'bar' };
  const context = { bar: 'baz' };

  const event = { request, platform: { context } };
  const resolve = vi.fn(() => Promise.resolve({}));
  return { options, event, resolve, request, context };
}

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
    const { options, event, resolve, request, context } = getHandlerInput();

    // @ts-expect-error - resolving an empty object is enough for this test
    vi.spyOn(SentryCloudflare, 'wrapRequestHandler').mockImplementationOnce((_, cb) => cb());

    const handle = initCloudflareSentryHandle(options);

    // @ts-expect-error - only passing a partial event object
    await handle({ event, resolve });

    expect(SentryCloudflare.wrapRequestHandler).toHaveBeenCalledTimes(1);
    expect(SentryCloudflare.wrapRequestHandler).toHaveBeenCalledWith(
      { options: expect.objectContaining({ dsn: options.dsn }), request, context, captureErrors: false },
      expect.any(Function),
    );

    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('adds flag to skip request isolation in subsequent sentry handler', async () => {
    const { options, event, resolve } = getHandlerInput();
    const locals = {};

    // @ts-expect-error - resolving an empty object is enough for this test
    vi.spyOn(SentryCloudflare, 'wrapRequestHandler').mockImplementationOnce((_, cb) => cb());

    const handle = initCloudflareSentryHandle(options);

    // @ts-expect-error - only passing a partial event object
    await handle({ event: { ...event, locals }, resolve });

    // @ts-expect-error - this property exists if the handler resolved correctly.
    expect(locals._sentrySkipRequestIsolation).toBe(true);
  });

  it('falls back to resolving the event, if no platform data is set', async () => {
    const { options, event, resolve } = getHandlerInput();
    // @ts-expect-error - removing platform data
    delete event.platform;

    // @ts-expect-error - resolving an empty object is enough for this test
    vi.spyOn(SentryCloudflare, 'wrapRequestHandler').mockImplementationOnce((_, cb) => cb());

    const handle = initCloudflareSentryHandle(options);

    // @ts-expect-error - only passing a partial event object
    await handle({ event, resolve });

    expect(SentryCloudflare.wrapRequestHandler).not.toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});
