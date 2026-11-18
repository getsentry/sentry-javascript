// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRuntimeRelease } from '../../src/vite/release';

describe('getRuntimeRelease', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the configured release name', () => {
    vi.stubEnv('SENTRY_RELEASE', 'from-env');

    expect(getRuntimeRelease({ release: { name: 'my-app@1.2.3' } })).toBe('my-app@1.2.3');
  });

  it('falls back to `SENTRY_RELEASE` like the bundler plugin', () => {
    vi.stubEnv('SENTRY_RELEASE', 'from-env');

    expect(getRuntimeRelease({})).toBe('from-env');
  });

  it('returns no release when `release.inject` is `false`', () => {
    vi.stubEnv('SENTRY_RELEASE', 'from-env');

    expect(getRuntimeRelease({ release: { name: 'my-app@1.2.3', inject: false } })).toBeUndefined();
  });
});
