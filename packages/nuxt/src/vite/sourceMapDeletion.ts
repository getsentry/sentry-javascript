import { createSentryBuildPluginManager, globFiles, type Options } from '@sentry/bundler-plugins/core';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Nitro's output directories, which depend on the Nitro preset, e.g. `dist` for the public files on Netlify. */
type NitroOutputDirs = { publicDir: string; serverDir: string };

/** The sides whose source maps only exist because Sentry enabled them, and where Nitro writes them once it is set up. */
export type DeletionFallback = { client: boolean; server: boolean; outputDirs?: NitroOutputDirs };

/**
 * Globs for the source maps in Nitro's output directories of the sides whose source maps only exist because Sentry
 * enabled them. Empty until Nitro is set up.
 */
export function getFallbackFilesToDelete(fallback: DeletionFallback | undefined): string[] {
  if (!fallback?.outputDirs) {
    return [];
  }

  const { client, server, outputDirs } = fallback;
  const { publicDir, serverDir } = outputDirs;
  return [
    ...(client ? getPublicSourceMapGlobs(publicDir, server ? undefined : serverDir) : []),
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

/** `filesToDeleteAfterUpload` is matched from the working directory and needs forward slashes, also on Windows. */
function toGlobPath(directory: string): string {
  return path.relative(process.cwd(), directory).split(path.sep).join('/') || '.';
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
