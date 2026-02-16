import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectAdapter } from '../../src/vite/detectAdapter';

let existsFile = true;
const pkgJson = {
  dependencies: {} as Record<string, string>,
  devDependencies: {} as Record<string, string>,
};
describe('detectAdapter', () => {
  beforeEach(() => {
    existsFile = true;
    vi.clearAllMocks();
    pkgJson.dependencies = {};
    pkgJson.devDependencies = {};
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

  describe('svelte.config.js (source of truth)', () => {
    it.each(['auto', 'vercel', 'node', 'cloudflare'])(
      'returns adapter from kit.adapter.name when provided (adapter %s)',
      async adapter => {
        const svelteConfig = { kit: { adapter: { name: `@sveltejs/adapter-${adapter}` } } };
        const detectedAdapter = await detectAdapter(svelteConfig, undefined);
        expect(detectedAdapter).toEqual(adapter);
      },
    );

    it('prefers svelte.config.js over package.json when both are present', async () => {
      pkgJson.dependencies['@sveltejs/adapter-vercel'] = '1.0.0';
      const svelteConfig = { kit: { adapter: { name: '@sveltejs/adapter-node' } } };
      const detectedAdapter = await detectAdapter(svelteConfig, undefined);
      expect(detectedAdapter).toEqual('node');
    });

    it('returns "other" when found adapter name in svelte.config.js is unsupported', async () => {
      pkgJson.dependencies['@sveltejs/adapter-vercel'] = '1.0.0';
      const svelteConfig = { kit: { adapter: { name: '@sveltejs/adapter-netlify' } } };
      const detectedAdapter = await detectAdapter(svelteConfig, undefined);
      expect(detectedAdapter).toEqual('other');
    });

    it('logs a warning if in debug mode and an unsupported adapter name is found in svelte.config.js', async () => {
      const svelteConfig = { kit: { adapter: { name: '@sveltejs/adapter-netlify' } } };
      await detectAdapter(svelteConfig, true);
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Detected unsupported adapter name'));
    });

    it('logs "from svelte.config.js" in debug when adapter comes from config', async () => {
      const svelteConfig = { kit: { adapter: { name: '@sveltejs/adapter-vercel' } } };
      await detectAdapter(svelteConfig, true);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('from `svelte.config.js`'));
    });
  });

  describe('package.json detection (fallback)', () => {
    it.each(['auto', 'vercel', 'node', 'cloudflare'])(
      'returns the adapter name (adapter %s) from dependencies and logs it to the console',
      async adapter => {
        pkgJson.dependencies[`@sveltejs/adapter-${adapter}`] = '1.0.0';
        const detectedAdapter = await detectAdapter(undefined, true);
        expect(detectedAdapter).toEqual(adapter);
        expect(consoleLogSpy).toHaveBeenCalledTimes(1);
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Detected SvelteKit ${adapter} adapter`));
      },
    );

    it.each(['auto', 'vercel', 'node', 'cloudflare'])(
      'returns the adapter name (adapter %s) from devDependencies and logs it to the console',
      async adapter => {
        pkgJson.devDependencies[`@sveltejs/adapter-${adapter}`] = '1.0.0';
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

      expect(await detectAdapter(undefined, undefined)).toEqual('vercel');

      delete pkgJson.dependencies['@sveltejs/adapter-vercel'];
      expect(await detectAdapter(undefined, undefined)).toEqual('node');

      delete pkgJson.dependencies['@sveltejs/adapter-node'];
      expect(await detectAdapter(undefined, undefined)).toEqual('cloudflare');
    });
  });
});
