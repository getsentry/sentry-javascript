import { vi } from 'vitest';

import { makeAutoInstrumentationPlugin } from '../../src/vite/autoInstrument';

const BASIC_LOAD_FUNCTION_CALL = 'export const load = () => {}';

function getWrappedBasicLoadFunctionCall(server = false) {
  return `import { wrap${server ? 'Server' : ''}LoadWithSentry } from '@sentry/sveltekit'; export const load = wrap${
    server ? 'Server' : ''
  }LoadWithSentry(() => {})`;
}

describe('makeAutoInstrumentationPlugin()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the auto instrumentation plugin', async () => {
    const plugin = await makeAutoInstrumentationPlugin({ debug: true, load: true, serverLoad: true });
    expect(plugin.name).toEqual('sentry-auto-instrumentation');
    expect(plugin.enforce).toEqual('post');
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
      const plugin = await makeAutoInstrumentationPlugin({ debug: false, load: true, serverLoad: true });
      // @ts-ignore this exists
      const transformResult = await plugin.transform.call(
        {
          getCombinedSourcemap: vi.fn().mockReturnValue({}),
        },
        BASIC_LOAD_FUNCTION_CALL,
        path,
      );
      expect(transformResult).toEqual({
        code: getWrappedBasicLoadFunctionCall(),
        map: null,
      });
    });

    it("doesn't wrap universal load if the file already contains Sentry code", async () => {
      const plugin = await makeAutoInstrumentationPlugin({ debug: false, load: true, serverLoad: false });
      // @ts-ignore this exists
      const transformResult = await plugin.transform.call(
        {
          getCombinedSourcemap: vi.fn().mockReturnValue({}),
        },
        `import { something } from "@sentry/sveltekit";${BASIC_LOAD_FUNCTION_CALL}`,
        path,
      );
      expect(transformResult).toEqual(null);
    });

    it("doesn't wrap universal load if `load` option is `false`", async () => {
      const plugin = await makeAutoInstrumentationPlugin({ debug: false, load: false, serverLoad: false });
      // @ts-ignore this exists
      const transformResult = await plugin.transform.call(
        {
          getCombinedSourcemap: vi.fn().mockReturnValue({}),
        },
        'foo',
        path,
      );
      expect(transformResult).toEqual(null);
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
      const plugin = await makeAutoInstrumentationPlugin({ debug: false, load: false, serverLoad: true });
      // @ts-ignore this exists
      const transformResult = await plugin.transform.call(
        {
          getCombinedSourcemap: vi.fn().mockReturnValue({}),
        },
        BASIC_LOAD_FUNCTION_CALL,
        path,
      );
      expect(transformResult).toEqual({
        code: getWrappedBasicLoadFunctionCall(true),
        map: null,
      });
    });

    it("doesn't wrap universal load if the file already contains Sentry code", async () => {
      const plugin = await makeAutoInstrumentationPlugin({ debug: false, load: false, serverLoad: true });
      // @ts-ignore this exists
      const transformResult = await plugin.transform.call(
        {
          getCombinedSourcemap: vi.fn().mockReturnValue({}),
        },
        `import { wrapServerLoadWithSentry } from "@sentry/sveltekit";${BASIC_LOAD_FUNCTION_CALL}`,
        path,
      );
      expect(transformResult).toEqual(null);
    });

    it("doesn't wrap universal load if `load` option is `false`", async () => {
      const plugin = await makeAutoInstrumentationPlugin({ debug: false, load: false, serverLoad: false });
      // @ts-ignore this exists
      const transformResult = await plugin.transform.call(
        {
          getCombinedSourcemap: vi.fn().mockReturnValue({}),
        },
        'foo',
        path,
      );
      expect(transformResult).toEqual(null);
    });
  });

  it.each([
    [
      'export variable declaration - function pointer',
      'export const load = loadPageData',
      "import { wrapLoadWithSentry } from '@sentry/sveltekit'; export const load = wrapLoadWithSentry(loadPageData)",
    ],
    [
      'export variable declaration - factory function call',
      'export const load = loadPageData()',
      "import { wrapLoadWithSentry } from '@sentry/sveltekit'; export const load = wrapLoadWithSentry(loadPageData())",
    ],
    [
      'export variable declaration - inline function',
      'export const load = () => { return { props: { msg: "hi" } } }',
      'import { wrapLoadWithSentry } from \'@sentry/sveltekit\'; export const load = wrapLoadWithSentry(() => { return { props: { msg: "hi" } } })',
    ],
    [
      'export variable declaration - inline async function',
      'export const load = async () => { return { props: { msg: "hi" } } }',
      'import { wrapLoadWithSentry } from \'@sentry/sveltekit\'; export const load = wrapLoadWithSentry(async () => { return { props: { msg: "hi" } } })',
    ],
    [
      'export variable declaration - inline multiline function',
      `export const load = async ({fetch}) => {
        const res = await fetch('https://example.com');
        return {
          props: {
            msg: res.toString(),
          }
        }
      }`,
      `import { wrapLoadWithSentry } from '@sentry/sveltekit'; export const load = wrapLoadWithSentry(async ({fetch}) => {
        const res = await fetch('https://example.com');
        return {
          props: {
            msg: res.toString(),
          }
        }
      })`,
    ],
    [
      'export variable declaration - undefined',
      'export const load = undefined',
      "import { wrapLoadWithSentry } from '@sentry/sveltekit'; export const load = wrapLoadWithSentry(undefined)",
    ],
    [
      'export variable declaration - null',
      'export const load = null',
      "import { wrapLoadWithSentry } from '@sentry/sveltekit'; export const load = wrapLoadWithSentry(null)",
    ],
    [
      'export function declaration - simple',
      'export function load () { return { props: { msg: "hi" } } }',
      'import { wrapLoadWithSentry } from \'@sentry/sveltekit\'; export const load = wrapLoadWithSentry(function _load() { return { props: { msg: "hi" } } });',
    ],
    [
      'export function declaration - with params',
      `export async function load({fetch}) {
        const res = await fetch('https://example.com');
        return { props: { msg: res.toString() } }
      }`,
      `import { wrapLoadWithSentry } from '@sentry/sveltekit'; export const load = wrapLoadWithSentry(async function _load({fetch}) {
        const res = await fetch('https://example.com');
        return { props: { msg: res.toString() } }
      });`,
    ],
    [
      'variable declaration',
      `import {something} from 'somewhere';
      const load = async ({fetch}) => {
        const res = await fetch('https://example.com');
        return { props: { msg: res.toString() } }
      }
      export { load}`,
      `import { wrapLoadWithSentry } from '@sentry/sveltekit'; import {something} from 'somewhere';
      const load = wrapLoadWithSentry(async ({fetch}) => {
        const res = await fetch('https://example.com');
        return { props: { msg: res.toString() } }
      })
      export { load}`,
    ],
    [
      'function declaration',
      `import {something} from 'somewhere';
       async function load({fetch}) {
         const res = await fetch('https://example.com');
         return { props: { msg: res.toString() } };
       }
       export { load }`,
      `import { wrapLoadWithSentry } from '@sentry/sveltekit'; import {something} from 'somewhere';
const load = wrapLoadWithSentry(async function _load({fetch}) {
  const res = await fetch('https://example.com');
  return { props: { msg: res.toString() } };
});
export { load }`,
    ],
    [
      'function declaration + other exports',
      `import {something} from 'somewhere';
      const prerender = false;
      async function load({fetch}) {
        const res = await fetch('https://example.com');
        return { props: { msg: res.toString() } }
      }
      export { load, prerender }`,
      `import { wrapLoadWithSentry } from '@sentry/sveltekit'; import {something} from 'somewhere';
const prerender = false;
const load = wrapLoadWithSentry(async function _load({fetch}) {
  const res = await fetch('https://example.com');
  return { props: { msg: res.toString() } }
});
export { load, prerender }`,
    ],
    [
      'file without load',
      'export const prerender = true\nexport const csr = true',
      'export const prerender = true\nexport const csr = true',
    ],
    ['commented out load', '// export const load = () => {}', '// export const load = () => {}'],
    ['commented out load', '// const load = () => {}', '// const load = () => {}'],
  ])(
    'correctly modifies the AST to wrap the load function (%s)',
    async (_: string, originalCode: string, wrappedCode: string) => {
      const plugin = await makeAutoInstrumentationPlugin({ debug: false, load: true, serverLoad: false });
      // @ts-ignore this exists
      const transformResult = await plugin.transform.call(
        {
          getCombinedSourcemap: vi.fn().mockReturnValue({}),
        },
        originalCode,
        'path/to/+page.ts',
      );
      expect(transformResult).toEqual({
        code: wrappedCode,
        map: null,
      });
    },
  );
});
