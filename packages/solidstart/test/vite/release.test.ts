// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRuntimeRelease } from '../../src/vite/release';

vi.mock('@sentry/bundler-plugins/core', () => ({
  resolveReleaseName: (name?: string) => name ?? 'detected-release',
}));

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  process.env.NODE_ENV = 'production';
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe('getRuntimeRelease', () => {
  it('resolves the release the build plugin would inject', () => {
    expect(getRuntimeRelease({})).toBe('detected-release');
    expect(getRuntimeRelease({ release: { name: 'my-release' } })).toBe('my-release');
  });

  it.each([
    ['`release.inject` is false', { release: { name: 'my-release', inject: false } }],
    ['source maps are disabled, which removes the build plugin', { sourcemaps: { disable: true } }],
  ])('returns nothing when %s', (_, options) => {
    expect(getRuntimeRelease(options)).toBeUndefined();
  });

  it('returns nothing in development, where the build plugin does not run', () => {
    process.env.NODE_ENV = 'development';

    expect(getRuntimeRelease({ release: { name: 'my-release' } })).toBeUndefined();
  });
});
