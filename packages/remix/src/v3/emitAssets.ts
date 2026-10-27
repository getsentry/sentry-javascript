import * as fs from 'node:fs';
import * as path from 'node:path';

import { UNSTAMPED_FETCH } from './assetServer';
import { addDebugIdToSourceMap, findDebugId } from './debugId';

/** The subset of `@remix-run/assets`' `AssetServer` this needs. */
export interface AssetServerLike {
  fetch(request: Request): Promise<Response | null>;
  getPreloads(filePath: string | readonly string[]): Promise<string[]>;
  [UNSTAMPED_FETCH]?: (request: Request) => Promise<Response | null>;
}

export interface EmitAssetsOptions {
  /** The app's own asset server. Driving the real one is what makes the debug IDs match production. */
  assets: AssetServerLike;
  /** Browser entry paths, e.g. `['app/actions/public/entry.ts']`. */
  entries: readonly string[];
  outDir: string;
}

export interface EmittedAsset {
  /** Public URL the module is served from. */
  url: string;
  file: string;
  /** Written when the asset server produced a source map for the module. */
  mapFile?: string;
  debugId?: string;
}

/**
 * Compile a Remix 3 app's browser module graph to disk, for a source map upload.
 *
 * Remix 3 has no build step, so there is no output directory to upload. This drives the app's own
 * asset server instead: same config, so the same compiled output and the same debug IDs the running
 * server serves. `getPreloads()` is what forces compilation; the server compiles lazily, so without
 * it only the modules something happened to request would exist.
 */
export async function emitAssets(options: EmitAssetsOptions): Promise<EmittedAsset[]> {
  const { assets, entries, outDir } = options;
  // Source maps are hidden by default, so they have to be read from the unstamped server.
  const fetchMap: AssetServerLike['fetch'] = assets[UNSTAMPED_FETCH] ?? (request => assets.fetch(request));

  const emitted: EmittedAsset[] = [];

  for (const url of await assets.getPreloads([...entries])) {
    const response = await assets.fetch(new Request(`http://asset-server${url}`));
    if (response?.status !== 200) {
      continue;
    }

    const source = await response.text();
    const debugId = findDebugId(source);
    const file = path.join(outDir, toRelativePath(url));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);

    const asset: EmittedAsset = { url, file, debugId };

    const mapResponse = await fetchMap(new Request(`http://asset-server${toMapUrl(url)}`));
    if (mapResponse?.status === 200) {
      const map = await mapResponse.text();
      asset.mapFile = `${file}.map`;
      fs.writeFileSync(asset.mapFile, debugId ? addDebugIdToSourceMap(map, debugId) : map);
    }

    emitted.push(asset);
  }

  return emitted;
}

// The server resolves the map from the pathname, so `.map` goes before any query.
function toMapUrl(url: string): string {
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? `${url}.map` : `${url.slice(0, queryIndex)}.map${url.slice(queryIndex)}`;
}

// Decoded, so the tree on disk mirrors the module layout rather than the asset server's encoding.
// Debug ID matching does not depend on these paths. `..` is dropped so the file stays under `outDir`.
function toRelativePath(url: string): string {
  const pathname = url.split('?')[0] ?? url;
  return path.join(
    ...pathname
      .replace(/^\//, '')
      .split('/')
      .map(segment => decodeURIComponent(segment).replace(/[/\\]/g, '_'))
      .filter(segment => segment !== '..'),
  );
}
