import { describe, expect, it } from 'vitest';
import { buildReleaseSnippet, makeServerReleaseVitePlugin } from '../../src/integration/release';

type TransformResult = { code: string } | null;

function transform(id: string, { ssr = true, isEntry = true } = {}): TransformResult {
  const plugin = makeServerReleaseVitePlugin('1.0.0');
  const context = { getModuleInfo: () => ({ isEntry }) };
  return (plugin.transform as (...args: unknown[]) => TransformResult).call(context, 'export {};', id, { ssr });
}

describe('buildReleaseSnippet', () => {
  it('sets the release global', () => {
    expect(buildReleaseSnippet('1.0.0')).toBe('globalThis.SENTRY_RELEASE={id:"1.0.0"};');
  });

  it('escapes a release that would end the inline script', () => {
    expect(buildReleaseSnippet('</script><script>alert(1)')).not.toContain('</script>');
  });
});

describe('makeServerReleaseVitePlugin', () => {
  it('serves a module that sets the release global', () => {
    const plugin = makeServerReleaseVitePlugin('1.0.0');
    const resolved = (plugin.resolveId as (id: string) => string | null)('virtual:@sentry/astro/release');

    expect((plugin.load as (id: string) => string | null)(resolved!)).toBe(buildReleaseSnippet('1.0.0'));
  });

  it('imports the release module first in server entries', () => {
    expect(transform('/src/entry.mjs')).toEqual({
      code: 'import "virtual:@sentry/astro/release";\nexport {};',
      map: null,
    });
  });

  it('imports the release module in the Cloudflare Worker entry', () => {
    expect(transform('\0virtual:cloudflare/worker-entry', { isEntry: false })?.code).toMatch(
      /^import "virtual:@sentry\/astro\/release";/,
    );
  });

  it.each([
    ['client modules', { ssr: false }],
    ['server modules that are not entries', { isEntry: false }],
  ])('leaves %s alone', (_, options) => {
    expect(transform('/src/page.ts', options)).toBeNull();
  });
});
