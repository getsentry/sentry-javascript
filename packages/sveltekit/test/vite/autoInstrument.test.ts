import { vi } from 'vitest';

import { makeAutoInstrumentationPlugin } from '../../src/vite/autoInstrument';

let returnFileWithSentryContent = false;

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    // @ts-ignore this exists, I promise!
    ...actual,
    promises: {
      // @ts-ignore this also exists, I promise!
      ...actual.promises,
      readFile: vi.fn().mockImplementation(() => {
        if (returnFileWithSentryContent) {
          return "import * as Sentry from '@sentry/sveltekit'";
        }
        return 'foo';
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
    returnFileWithSentryContent = false;
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
        'foo',
        path,
      );
      expect(transformResult).toEqual('transformed');
    });

    it("doesn't wrap universal load if the file already contains Sentry code", async () => {
      returnFileWithSentryContent = true;
      const plugin = await makeAutoInstrumentationPlugin({ debug: false, load: true, serverLoad: false });
      // @ts-ignore this exists
      const transformResult = await plugin.transform.call(
        {
          getCombinedSourcemap: vi.fn().mockReturnValue({}),
        },
        'foo',
        path,
      );
      expect(transformResult).toEqual('transformed');
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
        'foo',
        path,
      );
      expect(transformResult).toEqual('transformed');
    });

    it("doesn't wrap universal load if the file already contains Sentry code", async () => {
      returnFileWithSentryContent = true;
      const plugin = await makeAutoInstrumentationPlugin({ debug: false, load: false, serverLoad: true });
      // @ts-ignore this exists
      const transformResult = await plugin.transform.call(
        {
          getCombinedSourcemap: vi.fn().mockReturnValue({}),
        },
        'foo',
        path,
      );
      expect(transformResult).toEqual('transformed');
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
});
