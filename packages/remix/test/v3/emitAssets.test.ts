import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { UNSTAMPED_FETCH } from '../../src/v3/assetServer';
import { getDebugId, getDebugIdSnippet } from '../../src/v3/debugId';
import { emitAssets } from '../../src/v3/emitAssets';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function outDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emit-assets-'));
  dirs.push(dir);
  return dir;
}

/** What an instrumented asset server looks like: stamped modules, maps only through the unstamped fetch. */
function fakeServer(modules: Record<string, string>) {
  const stamped = async (request: Request): Promise<Response | null> => {
    const { pathname } = new URL(request.url);
    const source = modules[pathname];
    if (source === undefined) {
      return null;
    }
    const id = getDebugId(source);
    return new Response(`${getDebugIdSnippet(id)}\n${source}\n//# debugId=${id}`, {
      headers: { 'content-type': 'application/javascript' },
    });
  };
  const unstamped = async (request: Request): Promise<Response | null> => {
    const { pathname } = new URL(request.url);
    if (!pathname.endsWith('.map') || modules[pathname.slice(0, -4)] === undefined) {
      return null;
    }
    return new Response('{"version":3,"mappings":"AAAA"}', { headers: { 'content-type': 'application/json' } });
  };
  return {
    fetch: stamped,
    [UNSTAMPED_FETCH]: unstamped,
    getPreloads: async () => Object.keys(modules),
  };
}

describe('emitAssets', () => {
  it('writes every module in the graph with a map, and both carry the same debug ID', async () => {
    const dir = outDir();
    const assets = fakeServer({
      '/assets/app/entry.ts': 'export const a = 1;',
      '/assets/npm/%40remix-run/ui/run.js': 'export const b = 2;',
    });

    const emitted = await emitAssets({ assets, entries: ['app/entry.ts'], outDir: dir });

    expect(emitted).toHaveLength(2);
    for (const asset of emitted) {
      expect(asset.debugId).toBeDefined();
      expect(asset.mapFile).toBeDefined();
      expect(fs.readFileSync(asset.file, 'utf8')).toContain(`//# debugId=${asset.debugId}`);
      expect(JSON.parse(fs.readFileSync(asset.mapFile as string, 'utf8'))).toMatchObject({ debugId: asset.debugId });
    }
    // Decoded on disk, so the tree mirrors the module layout.
    expect(emitted[1]?.file).toBe(path.join(dir, 'assets', 'npm', '@remix-run', 'ui', 'run.js'));
  });

  it('reads source maps through the unstamped fetch, since stamping hides them', async () => {
    const assets = fakeServer({ '/assets/app/entry.ts': 'export const a = 1;' });
    // What the stamped server answers for a hidden map.
    expect(await assets.fetch(new Request('http://x/assets/app/entry.ts.map'))).toBeNull();

    const [asset] = await emitAssets({ assets, entries: ['app/entry.ts'], outDir: outDir() });

    expect(asset?.mapFile).toBeDefined();
  });

  it('asks for the map on the pathname when the URL carries a query', async () => {
    const urls: string[] = [];
    const assets = {
      fetch: async (request: Request) => {
        urls.push(request.url);
        return request.url.includes('.map') ? new Response('{"version":3}') : new Response('export const a = 1;');
      },
      getPreloads: async () => ['/assets/app/entry.ts?transform=x'],
    };

    const [asset] = await emitAssets({ assets, entries: ['app/entry.ts'], outDir: outDir() });

    expect(urls).toContain('http://asset-server/assets/app/entry.ts.map?transform=x');
    expect(asset?.mapFile).toBeDefined();
  });

  it('keeps every file under outDir, whatever the URL looks like', async () => {
    const dir = outDir();
    const assets = {
      fetch: async (request: Request) => (request.url.endsWith('.map') ? null : new Response('export const a = 1;')),
      getPreloads: async () => ['/assets/%2e%2e/%2e%2e/escaped.ts'],
    };

    const [asset] = await emitAssets({ assets, entries: ['escaped.ts'], outDir: dir });

    expect(asset?.file).toBe(path.join(dir, 'assets', 'escaped.ts'));
  });

  it('emits a module without a debug ID as served, so the caller can tell', async () => {
    const assets = {
      fetch: async (request: Request) =>
        new URL(request.url).pathname.endsWith('.map') ? null : new Response('export const a = 1;'),
      getPreloads: async () => ['/assets/app/entry.ts'],
    };

    const [asset] = await emitAssets({ assets, entries: ['app/entry.ts'], outDir: outDir() });

    expect(asset?.debugId).toBeUndefined();
    expect(asset?.mapFile).toBeUndefined();
  });
});
