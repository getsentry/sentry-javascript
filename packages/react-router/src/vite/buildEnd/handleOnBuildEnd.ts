import type { Config } from '@react-router/dev/dist/config';
import SentryCli from '@sentry/cli';
import glob from 'glob';
import * as fs from 'fs';

type ExtendedBuildEndArgs = Parameters<NonNullable<Config['buildEnd']>>[0] & {
  sentryConfig: {
    authToken?: string;
    org?: string;
    project?: string;
    sourceMapsUploadOptions?: {
      enabled?: boolean;
      filesToDeleteAfterUpload?: string | string[] | false;
    };
    release?: {
      name?: string;
    };
    debug?: boolean;
  };
};

type ExtendedBuildEndHook = (args: ExtendedBuildEndArgs) => void | Promise<void>;

/**
 * A build end hook that handles Sentry release creation and source map uploads.
 * It creates a new Sentry release if configured, uploads source maps to Sentry,
 * and optionally deletes the source map files after upload.
 */
export const sentryOnBuildEnd: ExtendedBuildEndHook = async ({ reactRouterConfig, viteConfig, sentryConfig }) => {
  const { authToken, org, project, release, sourceMapsUploadOptions, debug } = sentryConfig;
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

  // upload sourcemaps
  if (sourceMapsUploadOptions?.enabled ?? (true && viteConfig.build.sourcemap !== false)) {
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
          fs.promises.rm(filePathToDelete, { force: true }).catch((e: unknown) => {
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
