import { parseModule } from '@sentry/bundler-plugins/rewriter';
import { parseSync, type Plugin } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { makeAutoInstrumentationPlugin } from '../../src/vite/autoInstrument';
import type { ResolvedKitConfig } from '../../src/vite/kitConfig';

const DEFAULT_CONTENT = `
  export const load = () => {};
  export const prerender = true;
`;

type TransformResult = { code: string; map: unknown } | null;

function transform(
  plugin: Plugin,
  id: string,
  code = DEFAULT_CONTENT,
  context: Record<string, unknown> = {},
): Promise<TransformResult> {
  // @ts-expect-error this exists and is callable
  return plugin.transform.call(context, code, id);
}

interface Node {
  type: string;
  [key: string]: any;
}

/**
 * Asserts that `result` parses, imports `wrapper` from `@sentry/sveltekit`, and exports as `load`
 * a binding initialised with a call to `wrapper`.
 *
 * @returns the argument passed to `wrapper`
 */
function expectWrappedLoad(result: TransformResult, id: string, wrapper: string): string {
  expect(result).not.toBeNull();
  const program = parseModule(result!.code, id) as unknown as { body: Node[] };

  const imports = program.body.filter(
    node => node.type === 'ImportDeclaration' && node.source.value === '@sentry/sveltekit',
  );
  expect(imports.flatMap(node => node.specifiers.map((specifier: Node) => specifier.imported.name))).toEqual([wrapper]);

  const loadExports = program.body
    .filter(node => node.type === 'ExportNamedDeclaration')
    .flatMap(node => [
      ...(node.specifiers ?? []).filter(
        (specifier: Node) => (specifier.exported.name ?? specifier.exported.value) === 'load',
      ),
      ...(node.declaration?.declarations ?? []).filter((declarator: Node) => declarator.id.name === 'load'),
      ...(node.declaration?.id?.name === 'load' ? [node.declaration] : []),
    ]);
  expect(loadExports).toHaveLength(1);
  const local = loadExports[0].local.name;

  const declarator = program.body
    .filter(node => node.type === 'VariableDeclaration')
    .flatMap(node => node.declarations)
    .find((declarator: Node) => declarator.id.name === local);
  expect(declarator.init.type).toBe('CallExpression');
  expect(declarator.init.callee.name).toBe(wrapper);
  expect(declarator.init.arguments).toHaveLength(1);
  return declarator.init.arguments[0].name;
}

describe('makeAutoInstrumentationPlugin()', () => {
  it('returns the auto instrumentation plugin', async () => {
    const plugin = makeAutoInstrumentationPlugin({
      debug: true,
      load: true,
      serverLoad: true,
      getKitConfig: async () => ({}),
    });
    expect(plugin.name).toEqual('sentry-auto-instrumentation');
    expect(plugin.enforce).toEqual('pre');
    expect(plugin.transform).toEqual(expect.any(Function));
  });

  describe.each([
    'path/to/+page.ts',
    'path/to/+page.js',
    'path/to/+page.mts',
    'path/to/+page.mjs',
    'path/to/+layout.ts',
    'path/to/+layout.js',
    'path/to/+layout.mts',
    'path/to/+layout.mjs',
  ])('transform %s files', (path: string) => {
    it('wraps universal load if `load` option is `true`', async () => {
      const plugin = makeAutoInstrumentationPlugin({
        debug: false,
        load: true,
        serverLoad: true,
        getKitConfig: async () => ({}),
      });
      const result = await transform(plugin, path);
      expect(expectWrappedLoad(result, path, 'wrapLoadWithSentry')).toBe('load');
      expect(result!.code).toContain('const load = () => {};');
      expect(result!.map).toBeDefined();
    });

    it("doesn't wrap universal load if `load` option is `false`", async () => {
      const plugin = makeAutoInstrumentationPlugin({
        debug: false,
        load: false,
        serverLoad: false,
        getKitConfig: async () => ({}),
      });
      expect(await transform(plugin, path)).toEqual(null);
    });
  });

  describe.each([
    'path/to/+page.server.ts',
    'path/to/+page.server.js',
    'path/to/+page.server.mts',
    'path/to/+page.server.mjs',
    'path/to/+layout.server.ts',
    'path/to/+layout.server.js',
    'path/to/+layout.server.mts',
    'path/to/+layout.server.mjs',
  ])('transform %s files', (path: string) => {
    it('wraps server load if `serverLoad` option is `true`', async () => {
      const plugin = makeAutoInstrumentationPlugin({
        debug: false,
        load: false,
        serverLoad: true,
        getKitConfig: async () => ({}),
      });
      expect(expectWrappedLoad(await transform(plugin, path), path, 'wrapServerLoadWithSentry')).toBe('load');
    });

    it("doesn't wrap server load if `serverLoad` option is `false`", async () => {
      const plugin = makeAutoInstrumentationPlugin({
        debug: false,
        load: false,
        serverLoad: false,
        getKitConfig: async () => ({}),
      });
      expect(await transform(plugin, path)).toEqual(null);
    });
  });

  it.each(['path/to/+page.svelte', 'path/to/page.ts', 'path/to/+server.ts', 'path/to/+page.ts?raw'])(
    "doesn't transform %s",
    async (path: string) => {
      const plugin = makeAutoInstrumentationPlugin({
        debug: false,
        load: true,
        serverLoad: true,
        getKitConfig: async () => ({}),
      });
      expect(await transform(plugin, path)).toEqual(null);
    },
  );

  it("parses with Rolldown's `this.parse` in Vite 8", async () => {
    const plugin = makeAutoInstrumentationPlugin({
      debug: false,
      load: true,
      serverLoad: true,
      getKitConfig: async () => ({}),
    });
    const parse = vi.fn((input: string, options: object) => parseSync('module', input, options).program);
    const path = 'path/to/+page.ts';
    const code = 'export const load: PageLoad = async () => ({});';

    const result = await transform(plugin, path, code, { meta: { rolldownVersion: '1.2.11' }, parse });
    expect(parse).toHaveBeenCalledWith(code, { lang: 'ts', preserveParens: false });
    expectWrappedLoad(result, path, 'wrapLoadWithSentry');
  });

  it('logs the wrapped file in debug mode', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const plugin = makeAutoInstrumentationPlugin({
      debug: true,
      load: true,
      serverLoad: true,
      getKitConfig: async () => ({}),
    });
    await transform(plugin, 'path/to/+page.ts');
    expect(consoleLogSpy).toHaveBeenCalledWith('Wrapping path/to/+page.ts with Sentry load wrapper');
    consoleLogSpy.mockRestore();
  });

  describe('when SvelteKit native server tracing is enabled (client-only instrumentation)', () => {
    it.each([
      // server-only files
      'path/to/+page.server.ts',
      'path/to/+layout.server.js',
      // universal files
      'path/to/+page.mts',
      'path/to/+layout.mjs',
    ])("doesn't wrap code in SSR build in %s", async (path: string) => {
      const plugin = makeAutoInstrumentationPlugin({
        debug: false,
        load: true,
        serverLoad: true,
        getKitConfig: async () => ({ tracing: { server: true } }),
      });

      // @ts-expect-error this exists and is callable
      plugin.configResolved({
        build: {
          ssr: true,
        },
      });

      expect(await transform(plugin, path)).toEqual(null);
    });

    it.each(['path/to/+page.ts', 'path/to/+layout.js'])(
      'wraps client-side code in universal files in %s',
      async (path: string) => {
        const plugin = makeAutoInstrumentationPlugin({
          debug: false,
          load: true,
          serverLoad: true,
          getKitConfig: async () => ({ tracing: { server: true } }),
        });

        // @ts-expect-error this exists and is callable
        plugin.configResolved({
          build: {
            ssr: false,
          },
        });

        expectWrappedLoad(await transform(plugin, path), path, 'wrapLoadWithSentry');
      },
    );

    /**
     * This is a bit of a constructed case because in a client build, server-only files
     * shouldn't even be passed into the transform hook. But just to be extra careful, let's
     * make sure we don't wrap server-only files in a client build.
     */
    it.each(['path/to/+page.server.ts', 'path/to/+layout.server.js'])(
      "doesn't wrap client-side code in server-only files in %s",
      async (path: string) => {
        const plugin = makeAutoInstrumentationPlugin({
          debug: false,
          load: true,
          serverLoad: true,
          getKitConfig: async () => ({ tracing: { server: true } }),
        });

        // @ts-expect-error this exists and is callable
        plugin.configResolved({
          build: {
            ssr: false,
          },
        });

        expect(await transform(plugin, path)).toBe(null);
      },
    );
  });

  describe('when SvelteKit native server tracing is enabled', () => {
    // The location of the tracing flag differs by SvelteKit version:
    // - SvelteKit 3 (>= 3.0.0-next.8): `tracing.server`
    // - SvelteKit 2.31+ and early Kit 3 prereleases: `experimental.tracing.server`
    function kitConfigWithTracing(serverTracing: boolean, location: 'tracing' | 'experimental'): ResolvedKitConfig {
      const tracing = { tracing: { server: serverTracing } };
      return location === 'tracing' ? tracing : { experimental: tracing };
    }

    describe.each(['tracing', 'experimental'] as const)('with the flag in the `%s` location', location => {
      it.each(['path/to/+page.server.ts', 'path/to/+layout.server.js', 'path/to/+page.ts', 'path/to/+layout.mjs'])(
        "doesn't wrap %s in the SSR build",
        async (path: string) => {
          const plugin = makeAutoInstrumentationPlugin({
            debug: false,
            load: true,
            serverLoad: true,
            getKitConfig: async () => kitConfigWithTracing(true, location),
          });

          // @ts-expect-error this exists and is callable
          plugin.configResolved({ build: { ssr: true } });

          expect(await transform(plugin, path)).toEqual(null);
        },
      );

      it('still wraps server load in the SSR build when native tracing is not enabled', async () => {
        const plugin = makeAutoInstrumentationPlugin({
          debug: false,
          load: true,
          serverLoad: true,
          getKitConfig: async () => kitConfigWithTracing(false, location),
        });

        // @ts-expect-error this exists and is callable
        plugin.configResolved({ build: { ssr: true } });

        const path = 'path/to/+page.server.ts';
        expectWrappedLoad(await transform(plugin, path), path, 'wrapServerLoadWithSentry');
      });
    });
  });

  describe('when the server build is detected via the Vite Environment API', () => {
    // On Vite 6+ `config.build.ssr` no longer reliably reflects the per-environment
    // build, so the plugin relies on the current environment (`this.environment.name`). When
    // native tracing is enabled, universal load must not be wrapped in the `ssr` environment
    // (but should still be wrapped in `client`), even when `config.build.ssr`/`configResolved`
    // didn't flag a server build.
    it.each(['path/to/+page.ts', 'path/to/+layout.js', 'path/to/+page.server.ts'])(
      "doesn't wrap %s in the `ssr` environment",
      async (path: string) => {
        const plugin = makeAutoInstrumentationPlugin({
          debug: false,
          load: true,
          serverLoad: true,
          getKitConfig: async () => ({ tracing: { server: true } }),
        });

        // `configResolved` is intentionally not called - `isServerBuild` stays `undefined`
        expect(await transform(plugin, path, DEFAULT_CONTENT, { environment: { name: 'ssr' } })).toEqual(null);
      },
    );

    it('still wraps universal load in the `client` environment', async () => {
      const plugin = makeAutoInstrumentationPlugin({
        debug: false,
        load: true,
        serverLoad: true,
        getKitConfig: async () => ({ tracing: { server: true } }),
      });

      const path = 'path/to/+page.ts';
      const result = await transform(plugin, path, DEFAULT_CONTENT, { environment: { name: 'client' } });
      expectWrappedLoad(result, path, 'wrapLoadWithSentry');
    });
  });
});

describe('load export forms', () => {
  const PATH = 'path/to/+page.ts';

  function transformPage(code: string): Promise<TransformResult> {
    const plugin = makeAutoInstrumentationPlugin({
      debug: false,
      load: true,
      serverLoad: true,
      getKitConfig: async () => ({}),
    });
    return transform(plugin, PATH, code);
  }

  it.each([
    ['export variable declaration - function pointer', 'export const load=   loadPageData', 'load'],
    ['export variable declaration - factory function call', 'export const load    =loadPageData()', 'load'],
    [
      'export variable declaration - inline function',
      'export const load = () => { return { props: { msg: "hi" } } }',
      'load',
    ],
    ['export variable declaration - inline function let', 'export let load = () => {}', 'load'],
    [
      'export variable declaration - inline async function',
      'export const load = async () => { return { props: { msg: "hi" } } }',
      'load',
    ],

    ['export function declaration', 'export function load  (  ){ return { props: { msg: "hi" } } }', 'load'],
    [
      'export function declaration - with params',
      `export async function load({fetch}){
        const res = await fetch('https://example.com');
        return { props: { msg: res.toString() } }
      }`,
      'load',
    ],
    [
      'export function declaration - with angle bracket type assertion',
      `export async function load() {
        let x: unknown = 'foo';
        return {
          msg: <string>x,
        };
      }`,
      'load',
    ],
    [
      'variable declaration (let)',
      `import {something} from 'somewhere';
      let load = async () => {};
      export const prerender = true;
      export { load}`,
      'load',
    ],
    [
      'variable declaration (var)',
      `import {something} from 'somewhere';
      var    load=async () => {};
      export const prerender = true;
      export { load}`,
      'load',
    ],

    [
      'function declaration',
      `import {something} from 'somewhere';
       async function load(){};
       export { load }`,
      'load',
    ],
    [
      'function declaration, sentry commented out',
      `import {something} from 'somewhere';
       // import * as Sentry from '@sentry/sveltekit';
       async function load(){};
       export { load }`,
      'load',
    ],
    [
      'function declaration, sentry commented out',
      `import {something} from 'somewhere';
       /* import * as Sentry from '@sentry/sveltekit'; */
       async function load(){};
       export { load }`,
      'load',
    ],
    [
      'function declaration with different name',
      `import { foo } from 'somewhere';
       async function somethingElse(){};
       export { somethingElse as  load, foo }`,
      'somethingElse',
    ],
    [
      'function declaration with different string literal name',
      `import { foo } from 'somewhere';
       async function somethingElse(){};
       export { somethingElse as "load", foo }`,
      'somethingElse',
    ],
    [
      'export variable declaration - inline function with assigned type',
      `import type { LayoutLoad } from './$types';
       export const load :  LayoutLoad = async () => { return { props: { msg: "hi" } } }`,
      'load',
    ],
    ['re-export from another module', "export { load } from './shared';", '__SENTRY_REEXPORT_load__'],
    [
      'aliased re-export from another module',
      "export { sharedLoad as load, other } from './shared';",
      '__SENTRY_REEXPORT_load__',
    ],
    ['imported binding exported again', "import { load } from './shared';\nexport { load };", 'load'],
  ])('wraps a load declaration (%s)', async (_, code, target) => {
    expect(expectWrappedLoad(await transformPage(code), PATH, 'wrapLoadWithSentry')).toBe(target);
  });

  it('keeps the other exports of the rewritten statements', async () => {
    const code = [
      "import { foo } from 'somewhere';",
      'async function somethingElse(){};',
      'export const load = () => {}, prerender = true;',
      "export { foo } from './shared';",
      'export { somethingElse as other };',
    ].join('\n');
    const result = await transformPage(code);
    expectWrappedLoad(result, PATH, 'wrapLoadWithSentry');
    expect(result!.code).toContain('export { __SENTRY_WRAPPED_load__ as load, prerender };');
    expect(result!.code).toContain("export { foo } from './shared';");
    expect(result!.code).toContain('export { somethingElse as other };');
  });

  it("inserts the import after a 'use strict' directive", async () => {
    const result = await transformPage("'use strict';\nexport const load = () => {};");
    expect(result!.code).toMatch(/^'use strict';\nimport \{ wrapLoadWithSentry \} from '@sentry\/sveltekit';/);
  });

  it('does not add a second import of the wrapper', async () => {
    const result = await transformPage(
      "import { wrapLoadWithSentry } from '@sentry/sveltekit';\nexport const load = () => {};",
    );
    expectWrappedLoad(result, PATH, 'wrapLoadWithSentry');
  });

  it.each([
    [
      'inline',
      "import { wrapLoadWithSentry } from '@sentry/sveltekit';\nexport const load = wrapLoadWithSentry(() => {});",
    ],
    [
      'through a namespace',
      "import * as Sentry from '@sentry/sveltekit';\nexport const load = Sentry.wrapLoadWithSentry(() => {});",
    ],
    [
      'by specifier',
      "import { wrapServerLoadWithSentry } from '@sentry/sveltekit';\nconst wrapped = wrapServerLoadWithSentry(() => {});\nexport { wrapped as load };",
    ],
  ])('leaves a load the user wrapped by hand alone (%s)', async (_, code) => {
    expect(await transformPage(code)).toBeNull();
  });

  it.each([
    'export const almostLoad = () => {}; export const prerender = true;',
    'export const loadNotLoad = () => {}; export const prerender = true;',
    'export function aload(){}; export const prerender = true;',
    'export function loader(){}; export const prerender = true;',
    'let loadme = false; export {loadme}',
    'const a = {load: true}; export {a}',
    'if (s === "load") {}',
    'const a = load ? load : false',
    '// const load = () => {}',
    '/* export const load = () => {} */ export const prerender = true;',
    '/* export const notLoad = () => { const a = getSomething() as load; } */ export const prerender = true;',
    'const load = () => {}; export { load as other };',
    "export type { load } from './types';",
  ])('does not transform a module without a load export: %s', async code => {
    expect(await transformPage(code)).toBeNull();
  });

  it('does not transform a module that does not parse', async () => {
    expect(await transformPage('export const load = (')).toBeNull();
  });
});
