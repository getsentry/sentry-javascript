import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCacheFunctionSourceFile } from '../../src/server/useCacheSourceFile';

const NEXT_MANIFESTS_SINGLETON = Symbol.for('next.server.manifests');

const FUNCTION_ID = 'c05120808bb68f6400d039e720226869fb1f079019';
const LAYOUT_FILE = 'app/(cached-nesting)/mixed-lifetimes/[id]/layout.tsx';

const stableKey = JSON.stringify(['build-id', FUNCTION_ID, [['arg'], { locale: 'en' }]]);
const canaryKey = JSON.stringify([FUNCTION_ID, [['arg'], { locale: 'en' }], 'implementation-hash']);
const rootPayload = JSON.stringify([
  'build-id',
  FUNCTION_ID,
  [[], { children: { then: '$undefined' }, params: '$@1' }],
]);

function setManifest(filename: unknown, runtime: 'node' | 'edge' = 'node', functionId: string = FUNCTION_ID): void {
  (globalThis as Record<symbol, unknown>)[NEXT_MANIFESTS_SINGLETON] = {
    serverActionsManifest: { [runtime]: { [functionId]: { filename } } },
  };
}

// Mirrors `encodeFormData` in Next.js' `use-cache-wrapper.ts`: each field is
// `<hex length>:<content>`, lengths counting UTF-16 code units.
function multipartField(name: string, content: string): string {
  return `${name.length.toString(16)}:${name}${content.length.toString(16)}:${content}`;
}

describe('getCacheFunctionSourceFile', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repo/apps/web');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    Reflect.deleteProperty(globalThis, NEXT_MANIFESTS_SINGLETON);
  });

  describe('JSON cache keys', () => {
    it.each([
      ['the stable key shape `[buildId, functionId, args]`', stableKey],
      ['the canary key shape `[functionId, args, implementationHash]`', canaryKey],
    ])('resolves the source file for %s', (_label, cacheKey) => {
      setManifest(LAYOUT_FILE);

      expect(getCacheFunctionSourceFile(cacheKey)).toBe(LAYOUT_FILE);
    });

    it.each([
      ['an empty array', '[]'],
      ['a one-element array', JSON.stringify(['build-id'])],
      ['a stable-shaped key whose function id is not a string', JSON.stringify(['build-id', 42, [['arg'], {}]])],
      ['a canary-shaped key whose function id is not a string', JSON.stringify([42, [['arg'], {}], 'hash'])],
      ['invalid JSON that starts like an array', '[truncated'],
    ])('resolves no file for %s', (_label, cacheKey) => {
      setManifest(LAYOUT_FILE);

      expect(getCacheFunctionSourceFile(cacheKey)).toBeUndefined();
    });
  });

  describe('multipart cache keys', () => {
    it.each([
      ['the key parts in the first field', multipartField('0', rootPayload) + multipartField('1', '{"id":"some-id"}')],
      ['the key parts in a later field', multipartField('1', 'binary-ish :: data') + multipartField('0', rootPayload)],
      [
        'a preceding field whose content looks like framing',
        multipartField('1', '3:abc') + multipartField('0', rootPayload),
      ],
      ['a preceding field with empty content', multipartField('1', '') + multipartField('0', rootPayload)],
      [
        'a preceding field with non-ASCII content counted in UTF-16 code units',
        multipartField('1', 'héllo 😀 wörld') + multipartField('0', rootPayload),
      ],
    ])('resolves the source file for a key with %s', (_label, cacheKey) => {
      setManifest(LAYOUT_FILE);

      expect(getCacheFunctionSourceFile(cacheKey)).toBe(LAYOUT_FILE);
    });

    it.each([
      ['an empty key', ''],
      ['a field length that is not hex', `x:0${rootPayload}`],
      ['an uppercase field length (Next.js emits lowercase)', `A:aaaaaaaaaa${multipartField('0', rootPayload)}`],
      ['a field length pointing past the end of the key', `1:0ffff:${rootPayload}`],
      ['a key truncated inside a field', multipartField('0', rootPayload).slice(0, 10)],
      ['a field name without a content field', '1:0'],
      ['no field named "0"', multipartField('1', '{"id":"some-id"}')],
      ['an empty field named "0"', multipartField('0', '') + multipartField('1', '{"id":"some-id"}')],
      ['key parts that are a JSON object instead of an array', multipartField('0', '{"not":"an array"}')],
    ])('resolves no file for a key with %s', (_label, cacheKey) => {
      setManifest(LAYOUT_FILE);

      expect(getCacheFunctionSourceFile(cacheKey)).toBeUndefined();
    });
  });

  describe('manifest lookup', () => {
    it('resolves no file when the manifest singleton is missing', () => {
      expect(getCacheFunctionSourceFile(stableKey)).toBeUndefined();
    });

    it.each([
      [
        'the manifest does not know the function id',
        (): void => setManifest(LAYOUT_FILE),
        JSON.stringify(['build-id', 'other-id', []]),
      ],
      ['the manifest entry has no filename', (): void => setManifest(undefined), stableKey],
      ['the manifest filename is not a string', (): void => setManifest(42), stableKey],
      ['the manifest filename is empty', (): void => setManifest(''), stableKey],
    ])('resolves no file when %s', (_label, prepare, cacheKey) => {
      prepare();

      expect(getCacheFunctionSourceFile(cacheKey)).toBeUndefined();
    });

    it('reads the edge section of the manifest on the edge runtime', () => {
      vi.stubEnv('NEXT_RUNTIME', 'edge');
      setManifest(LAYOUT_FILE, 'edge');

      expect(getCacheFunctionSourceFile(stableKey)).toBe(LAYOUT_FILE);
    });

    it('ignores the node section of the manifest on the edge runtime', () => {
      vi.stubEnv('NEXT_RUNTIME', 'edge');
      setManifest(LAYOUT_FILE, 'node');

      expect(getCacheFunctionSourceFile(stableKey)).toBeUndefined();
    });

    it('reads the node section of the manifest when `NEXT_RUNTIME` is `nodejs`', () => {
      vi.stubEnv('NEXT_RUNTIME', 'nodejs');
      setManifest(LAYOUT_FILE, 'node');

      expect(getCacheFunctionSourceFile(stableKey)).toBe(LAYOUT_FILE);
    });
  });

  describe('project-relative paths', () => {
    it.each([
      [
        'strips a monorepo prefix that matches the cwd tail',
        '/repo/dev-packages/e2e-tests/test-applications/my-app',
        'dev-packages/e2e-tests/test-applications/my-app/app/(group)/page.tsx',
        'app/(group)/page.tsx',
      ],
      ['keeps a `src/app` layout intact', '/repo/apps/web', 'apps/web/src/app/page.tsx', 'src/app/page.tsx'],
      [
        'is not confused by an `app` directory inside the prefix',
        '/repo/packages/app',
        'packages/app/app/page.tsx',
        'app/page.tsx',
      ],
      ['strips the longest match when the cwd tail repeats', '/repo/a/b/a/b', 'a/b/a/b/page.tsx', 'page.tsx'],
      ['splits a Windows cwd on backslashes', 'C:\\repo\\apps\\web', 'apps/web/app/page.tsx', 'app/page.tsx'],
      ['ignores a trailing separator on the cwd', '/repo/apps/web/', 'apps/web/app/page.tsx', 'app/page.tsx'],
      [
        'keeps a file outside the app directory',
        '/repo/apps/web',
        'apps/web/lib/cached-queries.ts',
        'lib/cached-queries.ts',
      ],
      [
        'keeps the full path when the cwd does not match',
        '/somewhere/else',
        'dev-packages/my-app/app/page.tsx',
        'dev-packages/my-app/app/page.tsx',
      ],
      ['never strips the whole path', '/repo/my-app', 'my-app', 'my-app'],
    ])('%s', (_label, cwd, filename, expected) => {
      vi.spyOn(process, 'cwd').mockReturnValue(cwd);
      setManifest(filename);

      expect(getCacheFunctionSourceFile(stableKey)).toBe(expected);
    });
  });

  // Keys and manifest filenames captured verbatim from the `nextjs-16-cacheComponents` e2e app
  // (Next 16.3 dev + prod, 16.4.0-canary.57 prod) on 2026-10-02; only the machine-specific part
  // of the cwd is generalized. See `_proj-cache-components/research/cache-key-capture-howto.md`.
  describe('real-world keys', () => {
    const APP_PREFIX = 'dev-packages/e2e-tests/test-applications/nextjs-16-cacheComponents';

    it.each([
      [
        'a dev JSON key with four key parts',
        '["development","80c108a36ae1b809cefcec4ecb7ede5df718f8b93a",[],"0"]',
        '80c108a36ae1b809cefcec4ecb7ede5df718f8b93a',
        'app/cache/page.tsx',
      ],
      [
        'a dev multipart layout key',
        '1:063:["development","c0c36245c7b284678b232881c45d061cc5ce45f174",[{"params":"$@1","children":"$T"}],"0"]1:1c:{"id":"123"}',
        'c0c36245c7b284678b232881c45d061cc5ce45f174',
        'app/(cached-nesting)/mixed-lifetimes/[id]/layout.tsx',
      ],
      [
        'a prod JSON key (stable shape)',
        '["8SLlD3QlHgVCUdTRW5hzL","c02767c889ce99f14e39a7637aae5cfabf6a939d9a",["default-id"]]',
        'c02767c889ce99f14e39a7637aae5cfabf6a939d9a',
        'app/use-cache-page/page.tsx',
      ],
      [
        'a prod multipart layout key (stable shape)',
        '1:069:["8SLlD3QlHgVCUdTRW5hzL","c0a941ad6a1202c965f53812b0e13854f898cba7c9",[{"params":"$@1","children":"$T"}]]1:1c:{"id":"123"}',
        'c0a941ad6a1202c965f53812b0e13854f898cba7c9',
        'app/(cached-nesting)/mixed-lifetimes/[id]/layout.tsx',
      ],
      [
        'a canary JSON key, third part an array rather than a hash string',
        '["c02767c889ce99f14e39a7637aae5cfabf6a939d9a",["default-id"],["eWyFndmUdIGUjY7hj9qJJ"]]',
        'c02767c889ce99f14e39a7637aae5cfabf6a939d9a',
        'app/use-cache-page/page.tsx',
      ],
      [
        'a canary multipart layout key',
        '1:06b:["c0a941ad6a1202c965f53812b0e13854f898cba7c9",[{"params":"$@1","children":"$T"}],["eWyFndmUdIGUjY7hj9qJJ"]]1:1c:{"id":"123"}',
        'c0a941ad6a1202c965f53812b0e13854f898cba7c9',
        'app/(cached-nesting)/mixed-lifetimes/[id]/layout.tsx',
      ],
      [
        'a canary route-handler key (route handlers have manifest entries on 16.4+)',
        '["c06943f936da1e0a20710aae915fb68dbaa3527c74",["default-id"],["eWyFndmUdIGUjY7hj9qJJ"]]',
        'c06943f936da1e0a20710aae915fb68dbaa3527c74',
        'app/api/use-cache/route.ts',
      ],
    ])('resolves %s', (_label, cacheKey, functionId, appRelativePath) => {
      vi.spyOn(process, 'cwd').mockReturnValue(`/repo/${APP_PREFIX}`);
      setManifest(`${APP_PREFIX}/${appRelativePath}`, 'node', functionId);

      expect(getCacheFunctionSourceFile(cacheKey)).toBe(appRelativePath);
    });
  });
});
