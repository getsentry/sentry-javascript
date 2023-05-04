import { vi } from 'vitest';

import { canWrapLoad, makeAutoInstrumentationPlugin } from '../../src/vite/autoInstrument';

const DEFAULT_CONTENT = `
  export const load = () => {};
  export const prerender = true;
`;

let fileContent: string | undefined;

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    // @ts-ignore this exists, I promise!
    ...actual,
    promises: {
      // @ts-ignore this also exists, I promise!
      ...actual.promises,
      readFile: vi.fn().mockImplementation(() => {
        return fileContent || DEFAULT_CONTENT;
      }),
    },
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
    const plugin = makeAutoInstrumentationPlugin({ debug: true, load: true, serverLoad: true });
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
      const plugin = makeAutoInstrumentationPlugin({ debug: false, load: true, serverLoad: true });
      // @ts-ignore this exists
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
      });
      // @ts-ignore this exists
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
      const plugin = makeAutoInstrumentationPlugin({ debug: false, load: false, serverLoad: true });
      // @ts-ignore this exists
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
      });
      // @ts-ignore this exists
      const loadResult = await plugin.load(path);
      expect(loadResult).toEqual(null);
    });
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
      'variable declaration (let)',
      `import {something} from 'somewhere';
      let load = async () => {};
      export prerender = true;
      export { load}`,
    ],
    [
      'variable declaration (var)',
      `import {something} from 'somewhere';
      var    load=async () => {};
      export prerender = true;
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
  ])('returns `true` if a load declaration  (%s) exists and no Sentry code was found', async (_, code) => {
    fileContent = code;
    expect(await canWrapLoad('+page.ts', false)).toEqual(true);
  });

  it.each([
    'export const almostLoad = () => {}; export const prerender = true;',
    'export const loadNotLoad = () => {}; export const prerender = true;',
    'export function aload(){}; export const prerender = true;',
    'export function loader(){}; export const prerender = true;',
    'let loademe = false; export {loadme}',
    'const a = {load: true}; export {a}',
    'if (s === "load") {}',
    'const a = load ? load : false',
    '// const load = () => {}',
    '/* export const load = () => {} */ export const prerender = true;',
    '/* export const notLoad = () => { const a = getSomething() as load; } */ export const prerender = true;',
  ])('returns `false` if no load declaration exists', async (_, code) => {
    fileContent = code;
    expect(await canWrapLoad('+page.ts', false)).toEqual(true);
  });

  it('returns `false` if Sentry code was found', async () => {
    fileContent = 'import * as Sentry from "@sentry/sveltekit";';
    expect(await canWrapLoad('+page.ts', false)).toEqual(false);
  });

  it('returns `false` if Sentry code was found', async () => {
    fileContent = 'import * as Sentry from "@sentry/sveltekit";';
    expect(await canWrapLoad('+page.ts', false)).toEqual(false);
  });
});
