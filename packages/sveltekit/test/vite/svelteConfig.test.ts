import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupportedSvelteKitAdapters } from '../../src/vite/detectAdapter';
import { getAdapterOutputDir, getHooksFileName, loadSvelteConfig } from '../../src/vite/svelteConfig';

let existsFile: any;

describe('loadSvelteConfig', () => {
  vi.mock('fs', () => {
    return {
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
    const outputDir = await getAdapterOutputDir({ kit: { adapter: mockedAdapter } }, 'node');
    expect(outputDir).toEqual('customBuildDir');
  });

  it('returns the output directory of the Cloudflare adapter', async () => {
    const outputDir = await getAdapterOutputDir({ kit: { outDir: 'customOutDir' } }, 'cloudflare');
    expect(outputDir).toEqual('customOutDir/cloudflare');
  });

  it.each(['vercel', 'auto', 'other'] as SupportedSvelteKitAdapters[])(
    'returns the config.kit.outdir directory for adapter-%s',
    async adapter => {
      const outputDir = await getAdapterOutputDir({ kit: { outDir: 'customOutDir' } }, adapter);
      expect(outputDir).toEqual('customOutDir/output');
    },
  );

  it('falls back to the default out dir for all other adapters if outdir is not specified in the config', async () => {
    const outputDir = await getAdapterOutputDir({ kit: {} }, 'vercel');
    expect(outputDir).toEqual('.svelte-kit/output');
  });
});

describe('getHooksFileName', () => {
  it('returns the default hooks file name if no custom hooks file is specified', () => {
    const hooksFileName = getHooksFileName({}, 'server');
    expect(hooksFileName).toEqual('src/hooks.server');
  });

  it('returns the custom hooks file name if specified in the config', () => {
    const hooksFileName = getHooksFileName({ kit: { files: { hooks: { server: 'serverhooks' } } } }, 'server');
    expect(hooksFileName).toEqual('serverhooks');
  });
});
