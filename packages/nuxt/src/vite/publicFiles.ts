import { getLayerDirectories } from '@nuxt/kit';
import type { Nuxt } from '@nuxt/schema';
import { isStaticAssetRequest } from '@sentry/core/server';
import type { Nitro } from 'nitropack';
import * as fs from 'node:fs';
import * as path from 'node:path';

type PublicDir = { dir: string; baseURL?: string };

/** Returns the paths of the files Nitro serves from its public asset dirs, without the client build. */
export function getNitroPublicFilePaths(nitro: Nitro, nuxt: Nuxt): string[] {
  const clientBuildDir = path.resolve(nuxt.options.buildDir, 'dist/client');
  const publicDirs = nitro.options.publicAssets.filter(
    asset => !isInDirectory(path.resolve(asset.dir), clientBuildDir),
  );
  return getPublicFilePaths(publicDirs, nuxt.options.app.baseURL);
}

/** Returns the paths of the files in the `public/` dirs of all layers, which the Vite server serves. */
export function getLayerPublicFilePaths(nuxt: Nuxt): string[] {
  const publicDirs = getLayerDirectories(nuxt).map(dirs => ({ dir: dirs.public }));
  return getPublicFilePaths(publicDirs, nuxt.options.app.baseURL);
}

/**
 * Returns the URL paths of the files, without `app.baseURL`. Skips files the HTTP integration already ignores,
 * so the user's `ignoreStaticAssets` option still applies to them.
 */
function getPublicFilePaths(publicDirs: PublicDir[], baseURL: string): string[] {
  return publicDirs
    .flatMap(({ dir, baseURL: dirURL }) =>
      listFiles(path.resolve(dir)).map(file =>
        path.posix.join('/', dirURL ?? '', toUrlPath(path.relative(path.resolve(dir), file))),
      ),
    )
    .filter(urlPath => !isStaticAssetRequest(path.posix.join('/', baseURL, urlPath)));
}

/**
 * Percent-encodes the file path the way a browser encodes the request path, because spans store the encoded path.
 * `%`, `#` and `?` are part of the file name, so they are escaped before URL parsing.
 */
function toUrlPath(relativeFilePath: string): string {
  const filePath = relativeFilePath.split(path.sep).join('/').replace(/[%#?]/g, encodeURIComponent);
  return new URL(filePath, 'http://localhost/').pathname;
}

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : entry.isFile() ? [entryPath] : [];
  });
}

/** Also true for the dir itself. */
function isInDirectory(file: string, dir: string): boolean {
  const relativePath = path.relative(dir, file);
  return relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
}
