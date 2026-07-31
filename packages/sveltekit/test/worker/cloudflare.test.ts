import * as SentryCloudflare from '@sentry/cloudflare';
import { wrapRequestHandler } from '@sentry/cloudflare/request';
import type * as SentryCloudflareRequest from '@sentry/cloudflare/request';
import type { Carrier, GLOBAL_OBJ } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initCloudflareSentryHandle } from '../../src/worker';

vi.mock('@sentry/cloudflare/request', async importOriginal => {
  const actual = await importOriginal<typeof SentryCloudflareRequest>();
  return { ...actual, wrapRequestHandler: vi.fn(actual.wrapRequestHandler) };
});

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
    vi.mocked(wrapRequestHandler).mockClear();
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
    vi.mocked(wrapRequestHandler).mockImplementationOnce((_, cb) => cb());

    const handle = initCloudflareSentryHandle(options);

    // @ts-expect-error - only passing a partial event object
    await handle({ event, resolve });

    expect(wrapRequestHandler).toHaveBeenCalledTimes(1);
    expect(wrapRequestHandler).toHaveBeenCalledWith(
      { options: expect.objectContaining({ dsn: options.dsn }), request, context, captureErrors: false },
      expect.any(Function),
    );

    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('adds flag to skip request isolation in subsequent sentry handler', async () => {
    const { options, event, resolve } = getHandlerInput();
    const locals = {};

    // @ts-expect-error - resolving an empty object is enough for this test
    vi.mocked(wrapRequestHandler).mockImplementationOnce((_, cb) => cb());

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
    vi.mocked(wrapRequestHandler).mockImplementationOnce((_, cb) => cb());

    const handle = initCloudflareSentryHandle(options);

    // @ts-expect-error - only passing a partial event object
    await handle({ event, resolve });

    expect(wrapRequestHandler).not.toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});
