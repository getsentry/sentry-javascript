import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getVercelEnv } from '../../../src/utils/vercel';

describe('getVercelEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_TARGET_ENV;
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    delete process.env.NEXT_PUBLIC_VERCEL_TARGET_ENV;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns undefined when no Vercel env vars are set', () => {
    expect(getVercelEnv(false)).toBeUndefined();
    expect(getVercelEnv(true)).toBeUndefined();
  });

  it('returns VERCEL_TARGET_ENV without a prefix', () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_TARGET_ENV = 'staging';

    expect(getVercelEnv(false)).toBe('staging');
  });

  it('falls back to VERCEL_ENV when VERCEL_TARGET_ENV is not set', () => {
    process.env.VERCEL_ENV = 'production';

    expect(getVercelEnv(false)).toBe('production');
  });

  it('uses the NEXT_PUBLIC_ variants on the client', () => {
    process.env.VERCEL_TARGET_ENV = 'server-only';
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'preview';
    process.env.NEXT_PUBLIC_VERCEL_TARGET_ENV = 'staging';

    expect(getVercelEnv(true)).toBe('staging');

    delete process.env.NEXT_PUBLIC_VERCEL_TARGET_ENV;
    expect(getVercelEnv(true)).toBe('preview');
  });
});
