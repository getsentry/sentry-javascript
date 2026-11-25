import {
  createSentryBuildPluginManager,
  globFiles,
  type InternalOptions,
  type Options,
} from '@sentry/bundler-plugins/core';
import type { NitroConfig } from 'nitropack';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The sides whose source maps only exist because Sentry enabled them, and where Nitro writes them once it is set
 * up. `publicDir` is only set for a builder other than Vite, where no Vite plugin removes the client maps.
 */
export type DeletionFallback = { client: boolean; server: boolean; serverDir?: string; publicDir?: string };

/**
 * Globs for the source maps in Nitro's output directories of the sides whose source maps only exist because Sentry
 * enabled them. Empty until Nitro is set up. With the Vite builder, the Vite plugin removes the client maps itself.
 *
 * `sourcemaps.delete` replaces that rule: `true` covers both sides, `false` none.
 */
export function getFallbackFilesToDelete(fallback: DeletionFallback | undefined, deleteOption?: boolean): string[] {
  if (fallback?.serverDir === undefined || deleteOption === false) {
    return [];
  }

  const { serverDir, publicDir } = fallback;
  const client = deleteOption ?? fallback.client;
  const server = deleteOption ?? fallback.server;
  return [
    ...(client && publicDir !== undefined ? getPublicSourceMapGlobs(publicDir, server ? undefined : serverDir) : []),
    ...(server ? [`${toGlobPath(serverDir)}/**/*.map`] : []),
  ];
}

/**
 * `rollupConfig.output.sourcemap` overrides `sourcemap.server`, so the server source maps are then the user's.
 * `sourcemaps.delete: true` removes the server maps, so no `sourceMappingURL` comment may point to them.
 */
export function applyNitroSourceMapSettings(
  nitroConfig: NitroConfig,
  fallback: DeletionFallback,
  deleteOption: boolean | undefined,
): void {
  const userOutputSetting = nitroConfig.rollupConfig?.output?.sourcemap !== undefined;
  fallback.server &&= !userOutputSetting;

  if (deleteOption === true && nitroConfig.sourceMap === true && !userOutputSetting) {
    nitroConfig.sourceMap = 'hidden';
  }
}

/** Some presets write the server into the public dir, e.g. Cloudflare Pages into `dist/_worker.js`. */
function getPublicSourceMapGlobs(publicDir: string, keptServerDir: string | undefined): string[] {
  const publicGlob = toGlobPath(publicDir);

  if (keptServerDir === undefined || !isInDirectory(keptServerDir, publicDir)) {
    return [`${publicGlob}/**/*.map`];
  }

  const [serverDirName] = path.relative(publicDir, keptServerDir).split(path.sep);
  return [`${publicGlob}/*.map`, `${publicGlob}/!(${serverDirName})/**/*.map`];
}

/** Only the Vite builder runs the Vite plugin that removes the client source maps. */
export function isViteBuilder(nuxt: { options: { builder?: unknown } }): boolean {
  const { builder } = nuxt.options;
  return builder === undefined || builder === 'vite' || builder === '@nuxt/vite-builder';
}

export function logSentryEnabledSourceMaps(fallback: DeletionFallback, deleteOption?: boolean): void {
  for (const side of ['client', 'server'] as const) {
    if (fallback[side] && deleteOption !== undefined) {
      // eslint-disable-next-line no-console
      console.log(
        `[Sentry] We enabled \`'hidden'\` source maps for your ${side}-side build. ${
          deleteOption
            ? 'Sentry deletes them from the build output.'
            : 'They stay in the build output, because `sourcemaps.delete` is `false`.'
        }`,
      );
    } else if (fallback[side]) {
      // eslint-disable-next-line no-console
      console.log(
        `[Sentry] We enabled \`'hidden'\` source maps for your ${side}-side build. Sentry deletes them after the upload. Set \`sourcemaps.delete: false\` to keep them.`,
      );
    }
  }
}

/** The deletion globs are matched from the working directory and need forward slashes, also on Windows. */
function toGlobPath(directory: string): string {
  return path.relative(process.cwd(), directory).split(path.sep).join('/') || '.';
}

/**
 * Options for the Vite plugin of the client build. It removes the client maps Sentry enabled, unless the
 * user set `filesToDeleteAfterUpload`. The user's glob runs in the Nitro build instead, because a broad
 * glob would also match the SSR maps Nitro still needs. The SDK never read the user's
 * `deleteSourcemapsAfterUpload`, and `delete` replaces it.
 *
 * `sourcemaps.delete` replaces that rule for the client environment: `true` removes every client map, `false`
 * none. The plugin does not get the option itself, because it would also remove the SSR maps.
 *
 * The Vite server runs no Nitro, so a second plugin runs in its server environments (`viteServer`) and applies
 * the same rules to the server maps there.
 */
export function withClientSourceMapDeletion(
  options: InternalOptions,
  userSourcemaps: Pick<NonNullable<Options['sourcemaps']>, 'delete' | 'filesToDeleteAfterUpload'> | undefined,
  fallback: DeletionFallback,
  viteServer = false,
): InternalOptions {
  // The Vite server plugin is only added to server builds, so a build without an environment name is the server.
  const getSide = (environment: string | undefined): 'client' | 'server' | undefined =>
    viteServer
      ? environment === 'client'
        ? 'client'
        : 'server'
      : isClientEnvironment(environment)
        ? 'client'
        : undefined;

  return {
    ...options,
    sourcemaps: {
      ...options.sourcemaps,
      filesToDeleteAfterUpload: undefined,
      sdkFilesToDeleteAfterUpload: undefined,
      delete: undefined,
      deleteSourcemapsAfterUpload: undefined,
      // The Vite plugin reads this in its `config` hook, after `modules:done` set the fallback.
      sdkDeleteSourceMaps: environment => {
        const side = getSide(environment);
        if (side === undefined) {
          return undefined;
        }
        if (userSourcemaps?.delete !== undefined) {
          return userSourcemaps.delete;
        }
        return fallback[side] && userSourcemaps?.filesToDeleteAfterUpload === undefined ? true : undefined;
      },
    },
  };
}

/**
 * With the Vite environment API, one config holds the `client` and the server environments. Without it, the
 * plugin is only part of the client config, which has no named environments.
 */
function isClientEnvironment(environment: string | undefined): boolean {
  return environment === undefined || environment === 'client';
}

export function withoutSourceMapDeletion(options: InternalOptions): InternalOptions {
  return {
    ...options,
    sourcemaps: {
      ...options.sourcemaps,
      filesToDeleteAfterUpload: undefined,
      sdkFilesToDeleteAfterUpload: undefined,
      delete: undefined,
      deleteSourcemapsAfterUpload: undefined,
      sdkDeleteSourceMaps: false,
    },
  };
}

export async function deleteSourceMapsAfterBuild(options: InternalOptions): Promise<void> {
  const sdkFilesToDeleteAfterUpload = await options.sourcemaps?.sdkFilesToDeleteAfterUpload;

  if (sdkFilesToDeleteAfterUpload === undefined) {
    return;
  }

  const deletionOptions: InternalOptions = {
    ...options,
    sourcemaps: {
      ...options.sourcemaps,
      sdkFilesToDeleteAfterUpload,
    },
  };

  const sentryBuildPluginManager = createSentryBuildPluginManager(deletionOptions, {
    buildTool: 'nuxt',
    loggerPrefix: '[Sentry Nuxt]',
  });

  await sentryBuildPluginManager.deleteArtifacts();
}

/**
 * Deletes the files in `publicDir` that match `sdkFilesToDeleteAfterUpload`. Nitro answers a request for a file
 * it listed at build time but cannot read with a 500. Files outside `publicDir` are deleted in `close`.
 */
export async function deletePublicSourceMaps(options: InternalOptions, publicDir: string): Promise<void> {
  const sdkFilesToDeleteAfterUpload = await options.sourcemaps?.sdkFilesToDeleteAfterUpload;

  if (sdkFilesToDeleteAfterUpload === undefined) {
    return;
  }

  const files = await globFiles(sdkFilesToDeleteAfterUpload);
  const publicFiles = files.filter(file => isInDirectory(file, publicDir));

  await Promise.all(
    publicFiles.map(async file => {
      logDebug(options, `Deleting ${file} before Nitro bundles the server.`);
      // `deleteSourceMapsAfterBuild` tries again in `close`.
      await fs.promises.rm(file, { force: true }).catch(error => logDebug(options, `Could not delete ${file}.`, error));
    }),
  );
}

function logDebug(options: Options, ...messages: unknown[]): void {
  if (options.debug) {
    // eslint-disable-next-line no-console
    console.log('[Sentry]', ...messages);
  }
}

function isInDirectory(file: string, directory: string): boolean {
  const relativePath = path.relative(directory, file);
  return (
    relativePath !== '' &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}
