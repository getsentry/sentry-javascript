import { afterEach, describe, expect, it, vi } from 'vitest';
import { getClientRelease, makeClientReleasePlugin } from '../../src/vite/makeClientReleasePlugin';

type Transform = (code: string, id: string, options?: { ssr?: boolean }) => { code: string } | null;
type ResolveId = (id: string) => string | null;
type Load = (id: string) => string | null;

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
  const plugin = makeClientReleasePlugin('1.0.0"</script>');
  const transform = plugin.transform as unknown as Transform;
  const resolveId = plugin.resolveId as unknown as ResolveId;
  const load = plugin.load as unknown as Load;

  it('passes the server build entry and the release to the SDK', () => {
    const result = transform('export const entry = { module: entryServer };', '\0virtual:react-router/server-build', {
      ssr: true,
    });

    expect(result?.code).toContain("from '@sentry/react-router'");
    expect(result?.code).toContain(
      '__sentryInjectClientRelease(typeof entry === \'object\' ? entry : undefined, "1.0.0\\"\\u003c/script\\u003e");',
    );
  });

  // The bundler plugin injects the release into no chunk, so the server build sets it before `entry.server` and the
  // routes run.
  it('imports a module that sets `SENTRY_RELEASE` first in the server build', () => {
    const result = transform(
      'import * as entryServer from "./entry.server";\nexport const entry = {};',
      'virtual:react-router/server-build',
      {
        ssr: true,
      },
    );

    expect(result?.code.startsWith('import "virtual:sentry-react-router-release";import * as entryServer')).toBe(true);
  });

  it('serves the module that sets `SENTRY_RELEASE`', () => {
    const resolved = resolveId('virtual:sentry-react-router-release');

    expect(resolved).toBe('\0virtual:sentry-react-router-release');
    expect(load(resolved!)).toContain('e.SENTRY_RELEASE={id:"1.0.0\\"\\u003c/script\\u003e"};');
    expect(resolveId('/app/root.tsx')).toBeNull();
    expect(load('/app/root.tsx')).toBeNull();
  });

  it('leaves other modules and the client build alone', () => {
    expect(transform('', '\0virtual:react-router/server-build', { ssr: false })).toBeNull();
    expect(transform('', '/app/root.tsx', { ssr: true })).toBeNull();
  });
});
