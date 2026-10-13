import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getVercelEnv } from '../../../src/utils/vercel';

describe('getVercelEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_TARGET_ENV;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns undefined when no Vercel env vars are set', () => {
    expect(getVercelEnv()).toBeUndefined();
  });

  it('returns VERCEL_TARGET_ENV without a prefix', () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_TARGET_ENV = 'staging';

    expect(getVercelEnv()).toBe('staging');
  });

  it('falls back to VERCEL_ENV when VERCEL_TARGET_ENV is not set', () => {
    process.env.VERCEL_ENV = 'production';

    expect(getVercelEnv()).toBe('production');
  });
});
