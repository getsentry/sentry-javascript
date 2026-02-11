import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canWrapLoad, makeAutoInstrumentationPlugin } from '../../src/vite/autoInstrument';

const DEFAULT_CONTENT = `
  export const load = () => {};
  export const prerender = true;
`;

let fileContent: string | undefined;

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    promises: {
      // @ts-expect-error this also exists, I promise!
      ...actual.promises,
      readFile: vi.fn().mockImplementation(() => {
        return fileContent || DEFAULT_CONTENT;
      }),
    },
    existsSync: vi.fn().mockImplementation(id => {
      if (id === '+page.virtual.ts') {
        return false;
      }
      return true;
    }),
  };
});

vi.mock('rollup', () => {
  return {
    rollup: vi.fn().mockReturnValue({ generate: vi.fn().mockReturnValue({ output: ['transformed'] }) }),
  };
});

describe('makeAutoInstrumentationPlugin()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileContent = undefined;
  });

  it('returns the auto instrumentation plugin', async () => {
    const plugin = makeAutoInstrumentationPlugin({
      debug: true,
      load: true,
      serverLoad: true,
      onlyInstrumentClient: false,
    });
    expect(plugin.name).toEqual('sentry-auto-instrumentation');
    expect(plugin.enforce).toEqual('pre');
    expect(plugin.load).toEqual(expect.any(Function));
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
        onlyInstrumentClient: false,
      });
      // @ts-expect-error this exists
      const loadResult = await plugin.load(path);
      expect(loadResult).toEqual(
        'import { wrapLoadWithSentry } from "@sentry/sveltekit";' +
          `import * as userModule from "${path}?sentry-auto-wrap";` +
          'export const load = userModule.load ? wrapLoadWithSentry(userModule.load) : undefined;' +
          `export * from "${path}?sentry-auto-wrap";`,
      );
    });

    it("doesn't wrap universal load if `load` option is `false`", async () => {
      const plugin = makeAutoInstrumentationPlugin({
        debug: false,
        load: false,
        serverLoad: false,
        onlyInstrumentClient: false,
      });
      // @ts-expect-error this exists
      const loadResult = await plugin.load(path);
      expect(loadResult).toEqual(null);
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
    it('wraps universal load if `load` option is `true`', async () => {
      const plugin = makeAutoInstrumentationPlugin({
        debug: false,
        load: false,
        serverLoad: true,
        onlyInstrumentClient: false,
      });
      // @ts-expect-error this exists
      const loadResult = await plugin.load(path);
      expect(loadResult).toEqual(
        'import { wrapServerLoadWithSentry } from "@sentry/sveltekit";' +
          `import * as userModule from "${path}?sentry-auto-wrap";` +
          'export const load = userModule.load ? wrapServerLoadWithSentry(userModule.load) : undefined;' +
          `export * from "${path}?sentry-auto-wrap";`,
      );
    });

    it("doesn't wrap universal load if `load` option is `false`", async () => {
      const plugin = makeAutoInstrumentationPlugin({
        debug: false,
        load: false,
        serverLoad: false,
        onlyInstrumentClient: false,
      });
      // @ts-expect-error this exists
      const loadResult = await plugin.load(path);
      expect(loadResult).toEqual(null);
    });
  });

  describe('when `onlyInstrumentClient` is `true`', () => {
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
        onlyInstrumentClient: true,
      });

      // @ts-expect-error this exists and is callable
      plugin.configResolved({
        build: {
          ssr: true,
        },
      });

      // @ts-expect-error this exists
      const loadResult = await plugin.load(path);

      expect(loadResult).toEqual(null);
    });

    it.each(['path/to/+page.ts', 'path/to/+layout.js'])(
      'wraps client-side code in universal files in %s',
      async (path: string) => {
        const plugin = makeAutoInstrumentationPlugin({
          debug: false,
          load: true,
          serverLoad: true,
          onlyInstrumentClient: true,
        });

        // @ts-expect-error this exists and is callable
        plugin.configResolved({
          build: {
            ssr: false,
          },
        });

        // @ts-expect-error this exists and is callable
        const loadResult = await plugin.load(path);

        expect(loadResult).toBe(
          'import { wrapLoadWithSentry } from "@sentry/sveltekit";' +
            `import * as userModule from "${path}?sentry-auto-wrap";` +
            'export const load = userModule.load ? wrapLoadWithSentry(userModule.load) : undefined;' +
            `export * from "${path}?sentry-auto-wrap";`,
        );
      },
    );

    /**
     * This is a bit of a constructed case because in a client build, server-only files
     * shouldn't even be passed into the load hook. But just to be extra careful, let's
     * make sure we don't wrap server-only files in a client build.
     */
    it.each(['path/to/+page.server.ts', 'path/to/+layout.server.js'])(
      "doesn't wrap client-side code in server-only files in %s",
      async (path: string) => {
        const plugin = makeAutoInstrumentationPlugin({
          debug: false,
          load: true,
          serverLoad: true,
          onlyInstrumentClient: true,
        });

        // @ts-expect-error this exists and is callable
        plugin.configResolved({
          build: {
            ssr: false,
          },
        });

        // @ts-expect-error this exists and is callable
        const loadResult = await plugin.load(path);

        expect(loadResult).toBe(null);
      },
    );
  });
});

describe('canWrapLoad', () => {
  afterEach(() => {
    fileContent = undefined;
  });

  it.each([
    ['export variable declaration - function pointer', 'export const load=   loadPageData'],
    ['export variable declaration - factory function call', 'export const load    =loadPageData()'],
    ['export variable declaration - inline function', 'export const load = () => { return { props: { msg: "hi" } } }'],
    ['export variable declaration - inline function let', 'export let load = () => {}'],
    [
      'export variable declaration - inline async function',
      'export const load = async () => { return { props: { msg: "hi" } } }',
    ],

    ['export function declaration', 'export function load  (  ){ return { props: { msg: "hi" } } }'],
    [
      'export function declaration - with params',
      `export async function load({fetch}){
        const res = await fetch('https://example.com');
        return { props: { msg: res.toString() } }
      }`,
    ],
    [
      'export function declaration - with angle bracket type assertion',
      `export async function load() {
        let x: unknown = 'foo';
        return {
          msg: <string>x,
        };
      }`,
    ],
    [
      'variable declaration (let)',
      `import {something} from 'somewhere';
      let load = async () => {};
      export const prerender = true;
      export { load}`,
    ],
    [
      'variable declaration (var)',
      `import {something} from 'somewhere';
      var    load=async () => {};
      export const prerender = true;
      export { load}`,
    ],

    [
      'function declaration',
      `import {something} from 'somewhere';
       async function load(){};
       export { load }`,
    ],
    [
      'function declaration, sentry commented out',
      `import {something} from 'somewhere';
       // import * as Sentry from '@sentry/sveltekit';
       async function load(){};
       export { load }`,
    ],
    [
      'function declaration, sentry commented out',
      `import {something} from 'somewhere';
       /* import * as Sentry from '@sentry/sveltekit'; */
       async function load(){};
       export { load }`,
    ],
    [
      'function declaration with different name',
      `import { foo } from 'somewhere';
       async function somethingElse(){};
       export { somethingElse as  load, foo }`,
    ],
    [
      'function declaration with different string literal name',
      `import { foo } from 'somewhere';
       async function somethingElse(){};
       export { somethingElse as "load", foo }`,
    ],
    [
      'export variable declaration - inline function with assigned type',
      `import type { LayoutLoad } from './$types';
       export const load :  LayoutLoad = async () => { return { props: { msg: "hi" } } }`,
    ],
  ])('returns `true` if a load declaration  (%s) exists', async (_, code) => {
    fileContent = code;
    expect(await canWrapLoad('+page.ts', false)).toEqual(true);
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
  ])('returns `false` if no load declaration exists', async code => {
    fileContent = code;
    expect(await canWrapLoad('+page.ts', false)).toEqual(false);
  });

  it("returns `false` if the passed file id doesn't exist", async () => {
    fileContent = DEFAULT_CONTENT;
    expect(await canWrapLoad('+page.virtual.ts', false)).toEqual(false);
  });
});
