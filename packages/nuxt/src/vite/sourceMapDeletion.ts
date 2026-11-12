import {
  createSentryBuildPluginManager,
  globFiles,
  type InternalOptions,
  type Options,
} from '@sentry/bundler-plugins/core';
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
 */
export function getFallbackFilesToDelete(fallback: DeletionFallback | undefined): string[] {
  if (fallback?.serverDir === undefined) {
    return [];
  }

  const { client, server, serverDir, publicDir } = fallback;
  return [
    ...(client && publicDir !== undefined ? getPublicSourceMapGlobs(publicDir, server ? undefined : serverDir) : []),
    ...(server ? [`${toGlobPath(serverDir)}/**/*.map`] : []),
  ];
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

export function logSentryEnabledSourceMaps(fallback: DeletionFallback, viteBuilder: boolean): void {
  for (const side of ['client', 'server'] as const) {
    if (fallback[side]) {
      const userOptions =
        side === 'client' && viteBuilder
          ? '`sourcemaps.deleteSourcemapsAfterUpload` or `sourcemaps.filesToDeleteAfterUpload`'
          : '`sourcemaps.filesToDeleteAfterUpload`';
      // eslint-disable-next-line no-console
      console.log(
        `[Sentry] We enabled \`'hidden'\` source maps for your ${side}-side build. Sentry deletes them after the upload, unless you set ${userOptions}.`,
      );
    }
  }
}

/** `filesToDeleteAfterUpload` is matched from the working directory and needs forward slashes, also on Windows. */
function toGlobPath(directory: string): string {
  return path.relative(process.cwd(), directory).split(path.sep).join('/') || '.';
}

/**
 * Options for the Vite plugin of the client build. It removes the client maps Sentry enabled, unless the
 * user set `deleteSourcemapsAfterUpload` or `filesToDeleteAfterUpload`. The user's glob runs in the Nitro
 * build instead, because a broad glob would also match the SSR maps Nitro still needs.
 */
export function withClientSourceMapDeletion(
  options: Options,
  userSourcemaps:
    | Pick<NonNullable<Options['sourcemaps']>, 'deleteSourcemapsAfterUpload' | 'filesToDeleteAfterUpload'>
    | undefined,
  fallback: DeletionFallback,
): InternalOptions {
  return {
    ...options,
    sourcemaps: {
      ...options.sourcemaps,
      filesToDeleteAfterUpload: undefined,
      // The Vite plugin reads these in its `config` hook, after `modules:done` set the fallback.
      deleteSourcemapsAfterUpload: environment =>
        userSourcemaps?.deleteSourcemapsAfterUpload ??
        (isClientEnvironment(environment) && fallback.client && userSourcemaps?.filesToDeleteAfterUpload === undefined
          ? true
          : undefined),
      sdkEnabledSourceMaps: environment => isClientEnvironment(environment) && fallback.client,
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

export function withoutSourceMapDeletion(options: Options): Options {
  return {
    ...options,
    sourcemaps: {
      ...options.sourcemaps,
      filesToDeleteAfterUpload: undefined,
      deleteSourcemapsAfterUpload: false,
    },
  };
}

export async function deleteSourceMapsAfterBuild(options: Options): Promise<void> {
  const filesToDeleteAfterUpload = await options.sourcemaps?.filesToDeleteAfterUpload;

  if (filesToDeleteAfterUpload === undefined) {
    return;
  }

  const deletionOptions: Options = {
    ...options,
    sourcemaps: {
      ...options.sourcemaps,
      filesToDeleteAfterUpload,
    },
  };

  const sentryBuildPluginManager = createSentryBuildPluginManager(deletionOptions, {
    buildTool: 'nuxt',
    loggerPrefix: '[Sentry Nuxt]',
  });

  await sentryBuildPluginManager.deleteArtifacts();
}

/**
 * Deletes the files in `publicDir` that match `filesToDeleteAfterUpload`. Nitro answers a request for a file it
 * listed at build time but cannot read with a 500. Files outside `publicDir` are deleted in `close`.
 */
export async function deletePublicSourceMaps(options: Options, publicDir: string): Promise<void> {
  const filesToDeleteAfterUpload = await options.sourcemaps?.filesToDeleteAfterUpload;

  if (filesToDeleteAfterUpload === undefined) {
    return;
  }

  const files = await globFiles(filesToDeleteAfterUpload);
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
