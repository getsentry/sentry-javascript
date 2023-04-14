import { vi } from 'vitest';

import { getAdapterOutputDir, loadSvelteConfig } from '../../src/vite/svelteConfig';

let existsFile;

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
    adapt(builder) {
      builder.writeClient('customBuildDir');
    },
  };

  it('returns the output directory of the adapter', async () => {
    const outputDir = await getAdapterOutputDir({ kit: { adapter: mockedAdapter } });
    expect(outputDir).toEqual('customBuildDir');
  });
});
