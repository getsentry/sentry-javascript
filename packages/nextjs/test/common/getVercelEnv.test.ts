import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getClientVercelEnv } from '../../src/common/getVercelEnv';

describe('getClientVercelEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    delete process.env.NEXT_PUBLIC_VERCEL_TARGET_ENV;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns undefined when no Vercel env vars are set', () => {
    expect(getClientVercelEnv()).toBeUndefined();
  });

  it('prefers NEXT_PUBLIC_VERCEL_TARGET_ENV over NEXT_PUBLIC_VERCEL_ENV', () => {
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'preview';
    process.env.NEXT_PUBLIC_VERCEL_TARGET_ENV = 'staging';

    expect(getClientVercelEnv()).toBe('staging');

    delete process.env.NEXT_PUBLIC_VERCEL_TARGET_ENV;
    expect(getClientVercelEnv()).toBe('preview');
  });
});
