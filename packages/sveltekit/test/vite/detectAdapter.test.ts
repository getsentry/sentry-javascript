import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectAdapter } from '../../src/vite/detectAdapter';

let existsFile = true;
const pkgJson = {
  dependencies: {} as Record<string, string>,
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

  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  it.each(['auto', 'vercel', 'node', 'cloudflare'])(
    'returns the adapter name (adapter %s) and logs it to the console',
    async adapter => {
      pkgJson.dependencies[`@sveltejs/adapter-${adapter}`] = '1.0.0';
      const detectedAdapter = await detectAdapter(true);
      expect(detectedAdapter).toEqual(adapter);
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Detected SvelteKit ${adapter} adapter`));
    },
  );

  it('returns "other" if no supported adapter was found', async () => {
    pkgJson.dependencies['@sveltejs/adapter-netlify'] = '1.0.0';
    const detectedAdapter = await detectAdapter();
    expect(detectedAdapter).toEqual('other');
  });

  it('logs a warning if in debug mode and no supported adapter was found', async () => {
    pkgJson.dependencies['@sveltejs/adapter-netlify'] = '1.0.0';
    const detectedAdapter = await detectAdapter(true);
    expect(detectedAdapter).toEqual('other');
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Couldn't detect SvelteKit adapter"));
  });

  it('returns "other" if package.json isnt available and emits a warning log', async () => {
    existsFile = false;
    const detectedAdapter = await detectAdapter();
    expect(detectedAdapter).toEqual('other');

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Couldn't load package.json"),
      expect.any(Error),
    );
  });

  it('prefers all other adapters over adapter auto', async () => {
    pkgJson.dependencies['@sveltejs/adapter-auto'] = '1.0.0';
    pkgJson.dependencies['@sveltejs/adapter-vercel'] = '1.0.0';
    pkgJson.dependencies['@sveltejs/adapter-node'] = '1.0.0';
    pkgJson.dependencies['@sveltejs/adapter-cloudflare'] = '1.0.0';

    const detectedAdapter = await detectAdapter();
    expect(detectedAdapter).toEqual('vercel');

    delete pkgJson.dependencies['@sveltejs/adapter-vercel'];
    const detectedAdapter2 = await detectAdapter();
    expect(detectedAdapter2).toEqual('node');
    delete pkgJson.dependencies['@sveltejs/adapter-node'];
    const detectedAdapter3 = await detectAdapter();
    expect(detectedAdapter3).toEqual('cloudflare');
  });
});
