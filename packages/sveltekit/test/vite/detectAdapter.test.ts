import { vi } from 'vitest';

import { detectAdapter } from '../../src/vite/detectAdapter';

let existsFile = true;
const pkgJson = {
  dependencies: {},
};
describe('detectAdapter', () => {
  beforeEach(() => {
    existsFile = true;
    vi.clearAllMocks();
    pkgJson.dependencies = {};
  });

  vi.mock('fs', () => {
    return {
      existsSync: () => existsFile,
      promises: {
        readFile: () => {
          return Promise.resolve(JSON.stringify(pkgJson));
        },
      },
    };
  });

  it.each(['auto', 'vercel', 'node'])('returns the adapter name (adapter %s)', async adapter => {
    pkgJson.dependencies[`@sveltejs/adapter-${adapter}`] = '1.0.0';
    const detectedAdapter = await detectAdapter();
    expect(detectedAdapter).toEqual(adapter);
  });

  it('returns "other" if no supported adapter was found', async () => {
    pkgJson.dependencies['@sveltejs/adapter-netlify'] = '1.0.0';
    const detectedAdapter = await detectAdapter();
    expect(detectedAdapter).toEqual('other');
  });

  it('returns "other" if package.json isnt available and emits a warning log', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    existsFile = false;
    const detectedAdapter = await detectAdapter();
    expect(detectedAdapter).toEqual('other');

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });

  it('prefers all other adapters over adapter auto', async () => {
    pkgJson.dependencies['@sveltejs/adapter-auto'] = '1.0.0';
    pkgJson.dependencies['@sveltejs/adapter-vercel'] = '1.0.0';
    pkgJson.dependencies['@sveltejs/adapter-node'] = '1.0.0';

    const detectedAdapter = await detectAdapter();
    expect(detectedAdapter).toEqual('vercel');

    delete pkgJson.dependencies['@sveltejs/adapter-vercel'];
    const detectedAdapter2 = await detectAdapter();
    expect(detectedAdapter2).toEqual('node');
  });
});
