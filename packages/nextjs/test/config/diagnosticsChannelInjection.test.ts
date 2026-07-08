import { describe, expect, it } from 'vitest';
import { filterInstrumentedExternals, getTranspilePackages } from '../../src/config/diagnosticsChannelInjection';

describe('filterInstrumentedExternals', () => {
  it('removes orchestrion-instrumented packages, keeps the rest', () => {
    expect(
      filterInstrumentedExternals(['express', 'pg', 'pg-pool', 'ioredis', 'mongodb'], ['pg', 'pg-pool', 'ioredis']),
    ).toEqual(['express', 'mongodb']);
  });

  it('is a no-op with an empty instrumented list', () => {
    expect(filterInstrumentedExternals(['express', 'pg'], [])).toEqual(['express', 'pg']);
  });
});

describe('getTranspilePackages', () => {
  it('returns installed instrumented packages that Next externalizes by default', () => {
    const result = getTranspilePackages({
      instrumented: ['pg', 'pg-pool', 'ioredis', 'mysql', 'openai'],
      nextDefaultExternals: ['pg', 'pg-pool', 'mysql', 'mysql2'],
      isInstalled: name => name !== 'mysql', // pretend mysql is not installed
    });
    // ioredis/openai aren't Next-default-external → not needed; mysql not installed → excluded
    expect(result.sort()).toEqual(['pg', 'pg-pool']);
  });

  it('returns nothing when none of the instrumented packages are Next-default-external', () => {
    expect(
      getTranspilePackages({
        instrumented: ['ioredis', 'openai'],
        nextDefaultExternals: ['pg', 'mysql'],
        isInstalled: () => true,
      }),
    ).toEqual([]);
  });
});
