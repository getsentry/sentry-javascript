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
      const detectedAdapter = await detectAdapter(undefined, true);
      expect(detectedAdapter).toEqual(adapter);
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Detected SvelteKit ${adapter} adapter`));
    },
  );

  it('returns "other" if no supported adapter was found', async () => {
    pkgJson.dependencies['@sveltejs/adapter-netlify'] = '1.0.0';
    const detectedAdapter = await detectAdapter(undefined, undefined);
    expect(detectedAdapter).toEqual('other');
  });

  it('logs a warning if in debug mode and no supported adapter was found', async () => {
    pkgJson.dependencies['@sveltejs/adapter-netlify'] = '1.0.0';
    const detectedAdapter = await detectAdapter(undefined, true);
    expect(detectedAdapter).toEqual('other');
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Couldn't detect SvelteKit adapter"));
  });

  it('returns "other" if package.json isnt available and emits a warning log', async () => {
    existsFile = false;
    const detectedAdapter = await detectAdapter(undefined, undefined);
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

    const detectedAdapter = await detectAdapter(undefined, undefined);
    expect(detectedAdapter).toEqual('vercel');

    delete pkgJson.dependencies['@sveltejs/adapter-vercel'];
    const detectedAdapter2 = await detectAdapter(undefined, undefined);
    expect(detectedAdapter2).toEqual('node');
    delete pkgJson.dependencies['@sveltejs/adapter-node'];
    const detectedAdapter3 = await detectAdapter(undefined, undefined);
    expect(detectedAdapter3).toEqual('cloudflare');
  });

  describe('svelte.config.js (source of truth)', () => {
    it.each(['auto', 'vercel', 'node', 'cloudflare'])(
      'returns adapter from kit.adapter.name when provided (adapter %s)',
      async adapter => {
        const svelteConfig = { kit: { adapter: { name: `adapter-${adapter}` } } };
        const detectedAdapter = await detectAdapter(svelteConfig, undefined);
        expect(detectedAdapter).toEqual(adapter);
      },
    );

    it('prefers svelte.config.js over package.json when both are present', async () => {
      pkgJson.dependencies['@sveltejs/adapter-vercel'] = '1.0.0';
      const svelteConfig = { kit: { adapter: { name: 'adapter-node' } } };
      const detectedAdapter = await detectAdapter(svelteConfig, undefined);
      expect(detectedAdapter).toEqual('node');
    });

    it('falls back to package.json when adapter name is unsupported', async () => {
      pkgJson.dependencies['@sveltejs/adapter-vercel'] = '1.0.0';
      const svelteConfig = { kit: { adapter: { name: 'adapter-netlify' } } };
      const detectedAdapter = await detectAdapter(svelteConfig, undefined);
      expect(detectedAdapter).toEqual('vercel');
    });

    it('returns "other" when adapter name is unsupported and no matching dep in package.json', async () => {
      const svelteConfig = { kit: { adapter: { name: 'adapter-netlify' } } };
      const detectedAdapter = await detectAdapter(svelteConfig, undefined);
      expect(detectedAdapter).toEqual('other');
    });

    it('logs "from svelte.config.js" in debug when adapter comes from config', async () => {
      const svelteConfig = { kit: { adapter: { name: 'adapter-vercel' } } };
      await detectAdapter(svelteConfig, true);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('from svelte.config.js'));
    });
  });
});
