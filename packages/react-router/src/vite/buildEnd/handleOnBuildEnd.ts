import { rm } from 'node:fs/promises';
import type { Config } from '@react-router/dev/dist/config';
import SentryCli from '@sentry/cli';
import { glob } from 'glob';
import type { SentryReactRouterBuildOptions } from '../types';

type BuildEndHook = NonNullable<Config['buildEnd']>;

function getSentryConfig(viteConfig: unknown): SentryReactRouterBuildOptions {
  if (!viteConfig || typeof viteConfig !== 'object' || !('sentryConfig' in viteConfig)) {
    // eslint-disable-next-line no-console
    console.error('[Sentry] sentryConfig not found - it needs to be passed to vite.config.ts');
  }

  return (viteConfig as { sentryConfig: SentryReactRouterBuildOptions }).sentryConfig;
}

/**
 * A build end hook that handles Sentry release creation and source map uploads.
 * It creates a new Sentry release if configured, uploads source maps to Sentry,
 * and optionally deletes the source map files after upload.
 */
export const sentryOnBuildEnd: BuildEndHook = async ({ reactRouterConfig, viteConfig }) => {
  const {
    authToken,
    org,
    project,
    release,
    sourceMapsUploadOptions = { enabled: true },
    debug = false,
  } = getSentryConfig(viteConfig);

  const cliInstance = new SentryCli(null, {
    authToken,
    org,
    project,
  });
  // check if release should be created
  if (release?.name) {
    try {
      await cliInstance.releases.new(release.name);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[Sentry] Could not create release', error);
    }
  }

  if (sourceMapsUploadOptions?.enabled ?? (true && viteConfig.build.sourcemap !== false)) {
    // inject debugIds
    try {
      await cliInstance.execute(['sourcemaps', 'inject', reactRouterConfig.buildDirectory], debug);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[Sentry] Could not inject debug ids', error);
    }

    // upload sourcemaps
    try {
      await cliInstance.releases.uploadSourceMaps(release?.name || 'undefined', {
        include: [
          {
            paths: [reactRouterConfig.buildDirectory],
          },
        ],
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[Sentry] Could not upload sourcemaps', error);
    }
  }
  // delete sourcemaps after upload
  let updatedFilesToDeleteAfterUpload = sourceMapsUploadOptions?.filesToDeleteAfterUpload;
  // set a default value no option was set
  if (typeof sourceMapsUploadOptions?.filesToDeleteAfterUpload === 'undefined') {
    updatedFilesToDeleteAfterUpload = [`${reactRouterConfig.buildDirectory}/**/*.map`];
    if (debug) {
      // eslint-disable-next-line no-console
      console.info(
        `[Sentry] Automatically setting \`sourceMapsUploadOptions.filesToDeleteAfterUpload: ${JSON.stringify(
          updatedFilesToDeleteAfterUpload,
        )}\` to delete generated source maps after they were uploaded to Sentry.`,
      );
    }
  }
  if (updatedFilesToDeleteAfterUpload) {
    try {
      const filePathsToDelete = await glob(updatedFilesToDeleteAfterUpload, {
        absolute: true,
        nodir: true,
      });
      if (debug) {
        filePathsToDelete.forEach(filePathToDelete => {
          // eslint-disable-next-line no-console
          console.info(`Deleting asset after upload: ${filePathToDelete}`);
        });
      }
      await Promise.all(
        filePathsToDelete.map(filePathToDelete =>
          rm(filePathToDelete, { force: true }).catch((e: unknown) => {
            if (debug) {
              // This is allowed to fail - we just don't do anything
              // eslint-disable-next-line no-console
              console.debug(`An error occurred while attempting to delete asset: ${filePathToDelete}`, e);
            }
          }),
        ),
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error deleting files after sourcemap upload:', error);
    }
  }
};
