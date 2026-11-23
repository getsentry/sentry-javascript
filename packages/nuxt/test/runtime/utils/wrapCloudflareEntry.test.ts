// @vitest-environment node
import type { ExportedHandler } from '@cloudflare/workers-types';
import { SDK_VERSION } from '@sentry/core';
import { describe, expect, it, vi } from 'vitest';
import {
  wrapNitroCloudflareEntryWithSentry,
  wrapNitroDurableObjectWithSentry,
} from '../../../src/runtime/utils/wrapCloudflareEntry';

const cloudflareWorkers = vi.hoisted(() => {
  let currentEnv: unknown;

  return {
    withEnv: <T>(env: unknown, callback: () => T): T => {
      const previousEnv = currentEnv;
      currentEnv = env;
      try {
        return callback();
      } finally {
        currentEnv = previousEnv;
      }
    },
    getEnv: (): unknown => currentEnv,
  };
});

vi.mock('cloudflare:workers', () => ({ withEnv: cloudflareWorkers.withEnv }));

vi.mock('@sentry/cloudflare', () => ({
  withSentry: (optionsCallback: unknown, handler: unknown) => ({ optionsCallback, handler }),
  instrumentDurableObjectWithSentry: (optionsCallback: unknown, DurableObjectClass: unknown) => ({
    optionsCallback,
    DurableObjectClass,
  }),
}));

type WrappedHandler = {
  optionsCallback: (env: unknown) => unknown;
  handler: Record<string, (event: unknown, env: unknown, context: unknown) => unknown>;
};

type WrappedDurableObject = {
  optionsCallback: (env: unknown) => unknown;
  DurableObjectClass: new (state: unknown, env: unknown) => { fetch: () => unknown };
};

describe('wrapNitroCloudflareEntryWithSentry', () => {
  it('runs each handler with the `env` it gets as the `env` of `cloudflare:workers`', () => {
    const handler = { fetch: () => cloudflareWorkers.getEnv(), queue: () => cloudflareWorkers.getEnv() };
    const env = { DB: 'instrumented D1 binding' };

    const wrapped = wrapNitroCloudflareEntryWithSentry(
      () => ({}),
      handler as unknown as ExportedHandler,
    ) as unknown as WrappedHandler;

    expect(wrapped.handler.fetch?.({}, env, {})).toBe(env);
    expect(wrapped.handler.queue?.({ messages: [] }, env, {})).toBe(env);
    expect(cloudflareWorkers.getEnv()).toBeUndefined();
  });

  it('passes the options of the app with the Nuxt SDK metadata to `withSentry`', () => {
    const wrapped = wrapNitroCloudflareEntryWithSentry(
      env => ({ dsn: (env as { SENTRY_DSN: string }).SENTRY_DSN }),
      {},
    ) as unknown as WrappedHandler;

    expect(wrapped.optionsCallback({ SENTRY_DSN: 'https://public@dsn.ingest.sentry.io/1337' })).toEqual({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      _metadata: {
        sdk: {
          name: 'sentry.javascript.nuxt',
          version: SDK_VERSION,
          packages: [
            { name: 'npm:@sentry/nuxt', version: SDK_VERSION },
            { name: 'npm:@sentry/cloudflare', version: SDK_VERSION },
          ],
        },
      },
    });
  });
});

describe('wrapNitroDurableObjectWithSentry', () => {
  it('runs each method with `this.env` as the `env` of `cloudflare:workers` and keeps its name', () => {
    class NitroDurableObject {
      public constructor(
        _state: unknown,
        public env: unknown,
      ) {}

      public fetch(): unknown {
        return cloudflareWorkers.getEnv();
      }
    }
    const env = { DB: 'instrumented D1 binding' };

    const { DurableObjectClass, optionsCallback } = wrapNitroDurableObjectWithSentry(
      () => ({ dsn: 'https://public@dsn.ingest.sentry.io/1337' }),
      NitroDurableObject,
    ) as unknown as WrappedDurableObject;
    const durableObject = new DurableObjectClass({}, env);

    expect(durableObject).toBeInstanceOf(NitroDurableObject);
    expect(durableObject.fetch()).toBe(env);
    expect(durableObject.fetch.name).toBe('fetch');
    expect(optionsCallback({})).toEqual(
      expect.objectContaining({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        _metadata: { sdk: expect.objectContaining({ name: 'sentry.javascript.nuxt' }) },
      }),
    );
  });
});

describe('without `withEnv` in `cloudflare:workers`', () => {
  it('calls the handlers directly', async () => {
    vi.resetModules();
    vi.doMock('cloudflare:workers', () => ({ withEnv: undefined }));
    const { wrapNitroCloudflareEntryWithSentry: wrapWithoutWithEnv } =
      await import('../../../src/runtime/utils/wrapCloudflareEntry');
    const env = { DB: 'D1 binding' };

    const wrapped = wrapWithoutWithEnv(() => ({}), {
      fetch: (_request: unknown, handlerEnv: unknown) => handlerEnv,
    } as unknown as ExportedHandler) as unknown as WrappedHandler;

    expect(wrapped.handler.fetch?.({}, env, {})).toBe(env);
    vi.doUnmock('cloudflare:workers');
  });
});
