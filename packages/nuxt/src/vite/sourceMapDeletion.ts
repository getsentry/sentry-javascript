import { createSentryBuildPluginManager, globFiles, type Options } from '@sentry/bundler-plugins/core';
import * as fs from 'node:fs';
import * as path from 'node:path';

export function withoutSourceMapDeletion(options: Options): Options {
  return {
    ...options,
    sourcemaps: {
      ...options.sourcemaps,
      filesToDeleteAfterUpload: undefined,
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
