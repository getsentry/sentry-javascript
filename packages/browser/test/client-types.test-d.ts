import { describe, expectTypeOf, it } from 'vitest';
import type { BrowserOptions } from '../src';
import { BrowserClient, defaultStackParser, makeFetchTransport } from '../src';

describe('BrowserClient options', () => {
  const clientOnlyOptions = { integrations: [], stackParser: defaultStackParser, transport: makeFetchTransport };

  it('accepts BrowserOptions spread into the constructor', () => {
    const options: BrowserOptions = { dsn: 'https://public@dsn.ingest.sentry.io/1337', tunnel: '/tunnel' };

    expectTypeOf(BrowserClient).toBeConstructibleWith({ ...options, ...clientOnlyOptions });
  });

  it('accepts every tunnel form BrowserOptions accepts', () => {
    expectTypeOf(BrowserClient).toBeConstructibleWith({ ...clientOnlyOptions, tunnel: '/tunnel' });
    expectTypeOf(BrowserClient).toBeConstructibleWith({ ...clientOnlyOptions, tunnel: true });
    expectTypeOf(BrowserClient).toBeConstructibleWith({ ...clientOnlyOptions, tunnel: { basePath: '/docs' } });
  });

  it('exposes the resolved tunnel URL', () => {
    expectTypeOf<ReturnType<BrowserClient['getOptions']>['tunnel']>().toEqualTypeOf<string | undefined>();
  });
});
