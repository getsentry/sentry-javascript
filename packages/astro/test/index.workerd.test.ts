import { getMainCarrier } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setBindingsGetter } from '../src/worker/sdk';

describe('workerd entry point', () => {
  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    setBindingsGetter(undefined);
    vi.resetModules();
    vi.doUnmock('cloudflare:workers');
  });

  it('inits with the bindings from `cloudflare:workers`', async () => {
    vi.doMock('cloudflare:workers', () => ({ env: { SENTRY_DSN: 'https://binding@dsn.ingest.sentry.io/1' } }));

    const { init } = await import('../src/index.workerd');

    expect(init({ cacheClient: false })?.getOptions().dsn).toBe('https://binding@dsn.ingest.sentry.io/1');
  });

  it('inits without bindings when `env` is missing', async () => {
    vi.doMock('cloudflare:workers', () => ({ env: undefined }));

    const { init } = await import('../src/index.workerd');

    expect(init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', cacheClient: false })?.getOptions().dsn).toBe(
      'https://public@dsn.ingest.sentry.io/1337',
    );
  });
});
