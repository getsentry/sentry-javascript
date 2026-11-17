import { afterEach, describe, expect, it, vi } from 'vitest';
import { getClientRelease, makeClientReleasePlugin } from '../../src/vite/makeClientReleasePlugin';

type Transform = (code: string, id: string, options?: { ssr?: boolean }) => { code: string } | null;

describe('getClientRelease', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves the release like the bundler plugin', () => {
    vi.stubEnv('SENTRY_RELEASE', 'env-release');

    expect(getClientRelease({ release: { name: 'configured' } })).toBe('configured');
    expect(getClientRelease({})).toBe('env-release');
  });

  it('is undefined when the user turned off release injection', () => {
    vi.stubEnv('SENTRY_RELEASE', 'env-release');

    expect(getClientRelease({ release: { name: 'configured', inject: false } })).toBeUndefined();
  });
});

describe('makeClientReleasePlugin', () => {
  const transform = makeClientReleasePlugin('1.0.0"</script>').transform as unknown as Transform;

  it('passes the server build entry and the release to the SDK', () => {
    const result = transform('export const entry = { module: entryServer };', '\0virtual:react-router/server-build', {
      ssr: true,
    });

    expect(result?.code).toContain("from '@sentry/react-router'");
    expect(result?.code).toContain(
      '__sentryInjectClientRelease(typeof entry === \'object\' ? entry : undefined, "1.0.0\\"\\u003c/script\\u003e");',
    );
  });

  it('leaves other modules and the client build alone', () => {
    expect(transform('', '\0virtual:react-router/server-build', { ssr: false })).toBeNull();
    expect(transform('', '/app/root.tsx', { ssr: true })).toBeNull();
  });
});
