import { GLOBAL_OBJ } from '@sentry/core';
import { NUXT_BASE_PATH_GLOBAL } from './tunnel';

/** Holds `app.buildAssetsDir`. Set by the generated client config plugin and server runtime-flags module. */
export const NUXT_BUILD_ASSETS_DIR_GLOBAL = '__sentry_nuxt_build_assets_dir';

/** Holds `app.cdnURL`. Set by the generated client config plugin. */
export const NUXT_CDN_URL_GLOBAL = '__sentry_nuxt_cdn_url';

/** Holds the paths of the files in `public/`, without `app.baseURL`. Set by the server runtime-flags module. */
export const NUXT_PUBLIC_FILES_GLOBAL = '__sentry_nuxt_public_files';

const DEFAULT_BUILD_ASSETS_DIR = '/_nuxt/';

type GlobalWithNuxtPaths = {
  [NUXT_BASE_PATH_GLOBAL]?: string;
  [NUXT_BUILD_ASSETS_DIR_GLOBAL]?: string;
  [NUXT_CDN_URL_GLOBAL]?: string;
  [NUXT_PUBLIC_FILES_GLOBAL]?: string[];
};

/**
 * Returns `app.buildAssetsDir` with a leading and a trailing slash.
 * Returns `undefined` for `/`, because there build output and routes share one path.
 */
export function getNuxtBuildAssetsDir(
  buildAssetsDir = (GLOBAL_OBJ as GlobalWithNuxtPaths)[NUXT_BUILD_ASSETS_DIR_GLOBAL] ?? DEFAULT_BUILD_ASSETS_DIR,
): string | undefined {
  const dir = joinPath(buildAssetsDir);
  return dir === '/' ? undefined : dir;
}

/** Returns `app.baseURL` + `app.buildAssetsDir`, the path prefix of build output requests to the server. */
export function getNuxtBuildAssetsPath(
  baseURL = (GLOBAL_OBJ as GlobalWithNuxtPaths)[NUXT_BASE_PATH_GLOBAL] ?? '',
  buildAssetsDir?: string,
): string | undefined {
  const dir = getNuxtBuildAssetsDir(buildAssetsDir);
  return dir && joinPath(baseURL, dir);
}

/** Returns `app.cdnURL` (or `app.baseURL`) + `app.buildAssetsDir`, the URL prefix the browser loads build output from. */
export function getNuxtPublicBuildAssetsUrl(): string | undefined {
  const cdnURL = (GLOBAL_OBJ as GlobalWithNuxtPaths)[NUXT_CDN_URL_GLOBAL];
  const dir = getNuxtBuildAssetsDir();
  return cdnURL && dir ? `${cdnURL.replace(/\/+$/, '')}${dir}` : getNuxtBuildAssetsPath();
}

/** Returns the request paths of the files in `public/`, with `app.baseURL`. */
export function getNuxtPublicFilePaths(): string[] {
  const basePath = joinPath((GLOBAL_OBJ as GlobalWithNuxtPaths)[NUXT_BASE_PATH_GLOBAL] ?? '');
  return ((GLOBAL_OBJ as GlobalWithNuxtPaths)[NUXT_PUBLIC_FILES_GLOBAL] ?? []).map(
    file => `${basePath}${file.replace(/^\/+/, '')}`,
  );
}

function joinPath(...segments: string[]): string {
  return `/${segments.join('/')}/`.replace(/\/{2,}/g, '/');
}
