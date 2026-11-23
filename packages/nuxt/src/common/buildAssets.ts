import { GLOBAL_OBJ } from '@sentry/core';
import { NUXT_BASE_PATH_GLOBAL } from './tunnel';

/** Holds `app.buildAssetsDir`. Set by the generated client config plugin and server runtime-flags module. */
export const NUXT_BUILD_ASSETS_DIR_GLOBAL = '__sentry_nuxt_build_assets_dir';

const DEFAULT_BUILD_ASSETS_DIR = '/_nuxt/';

type GlobalWithNuxtPaths = { [NUXT_BASE_PATH_GLOBAL]?: string; [NUXT_BUILD_ASSETS_DIR_GLOBAL]?: string };

/**
 * Returns `app.buildAssetsDir` with a leading and a trailing slash.
 * Returns `undefined` for `/`, because there build output and routes share one path.
 */
export function getNuxtBuildAssetsDir(): string | undefined {
  const dir = joinPath((GLOBAL_OBJ as GlobalWithNuxtPaths)[NUXT_BUILD_ASSETS_DIR_GLOBAL] ?? DEFAULT_BUILD_ASSETS_DIR);
  return dir === '/' ? undefined : dir;
}

/** Returns `app.baseURL` + `app.buildAssetsDir`, the path prefix of build output requests to the server. */
export function getNuxtBuildAssetsPath(): string | undefined {
  const dir = getNuxtBuildAssetsDir();
  return dir && joinPath((GLOBAL_OBJ as GlobalWithNuxtPaths)[NUXT_BASE_PATH_GLOBAL] ?? '', dir);
}

function joinPath(...segments: string[]): string {
  return `/${segments.join('/')}/`.replace(/\/{2,}/g, '/');
}
