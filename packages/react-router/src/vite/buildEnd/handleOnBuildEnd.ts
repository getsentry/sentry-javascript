import { rm } from 'node:fs/promises';
import * as path from 'node:path';
import type { Config } from '@react-router/dev/config';
import { createSentrySDK } from 'sentry';
import { globFiles } from '@sentry/bundler-plugins/core';
import { resolveSourceMapsFeatures } from '@sentry/core';
import type { SentryVitePluginOptions } from '@sentry/bundler-plugins/vite';
import { SDK_ENABLED_SOURCE_MAPS_KEY } from '../makeEnableSourceMapsPlugin';
import type { SentryReactRouterBuildOptions } from '../types';

type BuildEndHook = NonNullable<Config['buildEnd']>;
type SentryOptions = NonNullable<Parameters<typeof createSentrySDK>[0]>;

/**
 * The CLI accepts `headers` since 0.44.0, but its bundled type declarations do not list the
 * option yet.
 * TODO: Drop once `SentryOptions` in the `sentry` package declares `headers`: https://github.com/getsentry/cli/pull/1500
 */
type SentryOptionsWithHeaders = SentryOptions & { headers?: Record<string, string> };

function getSentryConfig(viteConfig: unknown): SentryReactRouterBuildOptions {
  if (!viteConfig || typeof viteConfig !== 'object' || !('sentryConfig' in viteConfig)) {
    console.error('[Sentry] sentryConfig not found - it needs to be passed to vite.config.ts');
  }

  return (viteConfig as { sentryConfig: SentryReactRouterBuildOptions }).sentryConfig;
}

/** Glob patterns need forward slashes, but React Router resolves `buildDirectory` with the platform separator. */
function toGlobPath(directory: string): string {
  return directory.split(path.sep).join('/');
}

/**
 * A build end hook that handles Sentry release creation and source map uploads.
 * It creates a new Sentry release if configured, uploads source maps to Sentry,
 * and optionally deletes the source map files after upload.
 */
export const sentryOnBuildEnd: BuildEndHook = async ({ reactRouterConfig, viteConfig }) => {
  const sentryConfig = getSentryConfig(viteConfig);

  const {
    authToken,
    headers,
    org,
    project,
    release,
    sentryUrl,
    sourcemaps = { disable: false },
    debug = false,
  }: Omit<SentryReactRouterBuildOptions, 'sourcemaps'> &
    // Pick 'sourcemaps' from Vite plugin options as the types allow more (e.g. Promise values for `deleteFilesAfterUpload`)
    Pick<SentryVitePluginOptions, 'sourcemaps'> = {
    ...sentryConfig,
    sourcemaps: {
      ...sentryConfig.sourcemaps,
    },
    release: {
      ...sentryConfig.release,
    },
  };

  const sentryOptions: SentryOptionsWithHeaders = {
    token: authToken,
    org,
    url: sentryUrl,
    project: Array.isArray(project) ? undefined : project,
    headers,
  };

  const sentry = createSentrySDK(sentryOptions);

  if (release?.name && release.create !== false) {
    try {
      // The release API requires a project, and the one given to the SDK does not reach this call.
      await sentry.release.create({
        orgVersion: release.name,
        project: Array.isArray(project) ? project.join(',') : project,
      });
    } catch (error) {
      console.error('[Sentry] Could not create release', error);
    }
  }

  const { injectDebugIds, upload } = resolveSourceMapsFeatures(sourcemaps);

  if (injectDebugIds && viteConfig.build.sourcemap !== false) {
    // inject debugIds
    try {
      await sentry.sourcemap.inject({ directory: reactRouterConfig.buildDirectory });
    } catch (error) {
      console.error('[Sentry] Could not inject debug ids', error);
    }

    if (upload) {
      // upload sourcemaps
      try {
        const uploadClients = Array.isArray(project)
          ? project.map(project => createSentrySDK({ ...sentryOptions, project }))
          : [sentry];

        for (const client of uploadClients) {
          await client.sourcemap.upload({
            directory: reactRouterConfig.buildDirectory,
            release: release?.name || 'undefined',
          });
        }
      } catch (error) {
        console.error('[Sentry] Could not upload sourcemaps', error);
      }
    }
  }

  const deleteOption = sourcemaps?.delete;

  // Without `sourcemaps.delete: true`, source maps are only cleaned up when Sentry uploads them.
  // Deleting them after skipping the upload would leave the user with neither, breaking a manual upload.
  if (deleteOption !== true && !upload) {
    return;
  }

  const userFilesToDeleteAfterUpload = await sourcemaps?.filesToDeleteAfterUpload;
  const defaultFilesToDelete = [`${toGlobPath(reactRouterConfig.buildDirectory)}/**/*.map`];
  let updatedFilesToDeleteAfterUpload: string | string[] | undefined;

  if (deleteOption === true) {
    updatedFilesToDeleteAfterUpload = [...defaultFilesToDelete, ...[userFilesToDeleteAfterUpload ?? []].flat()];
  } else if (deleteOption === false) {
    updatedFilesToDeleteAfterUpload = userFilesToDeleteAfterUpload;
  } else if (typeof userFilesToDeleteAfterUpload !== 'undefined') {
    updatedFilesToDeleteAfterUpload = userFilesToDeleteAfterUpload;
  } else if ((viteConfig as Record<string, unknown>)[SDK_ENABLED_SOURCE_MAPS_KEY] === true) {
    updatedFilesToDeleteAfterUpload = defaultFilesToDelete;
    debug &&
      console.info(
        `[Sentry] Automatically setting \`sourcemaps.filesToDeleteAfterUpload: ${JSON.stringify(
          updatedFilesToDeleteAfterUpload,
        )}\` to delete generated source maps after they were uploaded to Sentry.`,
      );
  }
  if (updatedFilesToDeleteAfterUpload) {
    try {
      const filePathsToDelete = await globFiles(updatedFilesToDeleteAfterUpload);
      if (debug) {
        filePathsToDelete.forEach(filePathToDelete => {
          console.info(`Deleting asset after upload: ${filePathToDelete}`);
        });
      }
      await Promise.all(
        filePathsToDelete.map(filePathToDelete =>
          rm(filePathToDelete, { force: true }).catch((e: unknown) => {
            // This is allowed to fail - we just don't do anything
            debug && console.debug(`An error occurred while attempting to delete asset: ${filePathToDelete}`, e);
          }),
        ),
      );
    } catch (error) {
      console.error('Error deleting files after sourcemap upload:', error);
    }
  }
};
