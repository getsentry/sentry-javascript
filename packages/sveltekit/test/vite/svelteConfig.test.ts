import type * as FsModule from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupportedSvelteKitAdapters } from '../../src/vite/detectAdapter';
import { getAdapterOutputDir, getHooksFileName, loadSvelteConfig } from '../../src/vite/svelteConfig';

let existsFile: any;

describe('loadSvelteConfig', () => {
  vi.mock('fs', async importOriginal => {
    const actual = await importOriginal<typeof FsModule>();
    return {
      ...actual,
      existsSync: () => existsFile,
    };
  });

  vi.mock(`${process.cwd()}/svelte.config.js`, () => {
    return {
      default: {
        kit: {
          adapter: {},
        },
      },
    };
  });

  // url apparently doesn't exist in the test environment, therefore we mock it:
  vi.mock('url', () => {
    return {
      pathToFileURL: (path: string) => {
        return {
          href: path,
        };
      },
    };
  });

  beforeEach(() => {
    existsFile = true;
    vi.clearAllMocks();
  });

  it('returns the svelte config', async () => {
    const config = await loadSvelteConfig();
    expect(config).toStrictEqual({
      kit: {
        adapter: {},
      },
    });
  });

  it('returns an empty object if svelte.config.js does not exist', async () => {
    existsFile = false;

    const config = await loadSvelteConfig();
    expect(config).toStrictEqual({});
  });
});

describe('getAdapterOutputDir', () => {
  const mockedAdapter = {
    name: 'mocked-adapter',
    adapt(builder: any) {
      builder.writeClient('customBuildDir');
    },
  };

  it('returns the output directory of the Node adapter', async () => {
    const outputDir = await getAdapterOutputDir({ adapter: mockedAdapter }, 'node');
    expect(outputDir).toEqual('customBuildDir');
  });

  it("doesn't let the Node adapter delete the real output directory", async () => {
    const actualFs = await vi.importActual<typeof FsModule>('fs');
    const originalCwd = process.cwd();
    const projectDir = actualFs.mkdtempSync(path.join(os.tmpdir(), 'sentry-sveltekit-test-'));
    actualFs.mkdirSync(path.join(projectDir, 'customOut'));
    actualFs.writeFileSync(path.join(projectDir, 'customOut', 'index.js'), '');

    // Like `@sveltejs/adapter-node` v6, which removes its output dir itself instead of via `builder.rimraf`
    const nodeAdapter = {
      name: '@sveltejs/adapter-node',
      async adapt(builder: any) {
        actualFs.rmSync('customOut', { force: true, recursive: true });
        builder.writeClient(`customOut/client${builder.config.paths.base}`);
      },
    };

    process.chdir(projectDir);
    try {
      const outputDir = await getAdapterOutputDir({ adapter: nodeAdapter }, 'node');

      expect(outputDir).toEqual('customOut');
      expect(process.cwd()).toEqual(actualFs.realpathSync(projectDir));
      expect(actualFs.readdirSync(path.join(projectDir, 'customOut'))).toEqual(['index.js']);
    } finally {
      process.chdir(originalCwd);
      actualFs.rmSync(projectDir, { force: true, recursive: true });
    }
  });

  it('returns the output directory of the Cloudflare adapter', async () => {
    const outputDir = await getAdapterOutputDir({ outDir: 'customOutDir' }, 'cloudflare');
    expect(outputDir).toEqual('customOutDir/cloudflare');
  });

  it.each(['vercel', 'auto', 'other'] as SupportedSvelteKitAdapters[])(
    'returns the config.kit.outdir directory for adapter-%s',
    async adapter => {
      const outputDir = await getAdapterOutputDir({ outDir: 'customOutDir' }, adapter);
      expect(outputDir).toEqual('customOutDir/output');
    },
  );

  it('falls back to the default out dir for all other adapters if outdir is not specified in the config', async () => {
    const outputDir = await getAdapterOutputDir({}, 'vercel');
    expect(outputDir).toEqual('.svelte-kit/output');
  });
});

describe('getHooksFileName', () => {
  it('returns the default hooks file name if no custom hooks file is specified', () => {
    const hooksFileName = getHooksFileName({}, 'server');
    expect(hooksFileName).toEqual('src/hooks.server');
  });

  it('returns the custom hooks file name if specified in the config', () => {
    const hooksFileName = getHooksFileName({ files: { hooks: { server: 'serverhooks' } } }, 'server');
    expect(hooksFileName).toEqual('serverhooks');
  });
});
