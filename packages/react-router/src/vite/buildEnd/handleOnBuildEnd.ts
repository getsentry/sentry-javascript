import { rm } from 'node:fs/promises';
import type { Config } from '@react-router/dev/config';
import SentryCli from '@sentry/cli';
import type { SentryVitePluginOptions } from '@sentry/vite-plugin';
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
  const sentryConfig = getSentryConfig(viteConfig);

  // todo(v11): Remove deprecated sourceMapsUploadOptions support (no need for spread/pick anymore)
  const {
    sourceMapsUploadOptions, // extract to exclude from rest config
    ...sentryConfigWithoutDeprecatedSourceMapOption
  } = sentryConfig;

  const {
    authToken,
    org,
    project,
    release,
    sourcemaps = { disable: false },
    debug = false,
  }: Omit<SentryReactRouterBuildOptions, 'sourcemaps' | 'sourceMapsUploadOptions'> &
    // Pick 'sourcemaps' from Vite plugin options as the types allow more (e.g. Promise values for `deleteFilesAfterUpload`)
    Pick<SentryVitePluginOptions, 'sourcemaps'> = {
    ...sentryConfig.unstable_sentryVitePluginOptions,
    ...sentryConfigWithoutDeprecatedSourceMapOption, // spread in the config without the deprecated sourceMapsUploadOptions
    sourcemaps: {
      ...sentryConfig.unstable_sentryVitePluginOptions?.sourcemaps,
      ...sentryConfig.sourcemaps,
      ...sourceMapsUploadOptions,
      // eslint-disable-next-line deprecation/deprecation
      disable: sourceMapsUploadOptions?.enabled === false ? true : sentryConfig.sourcemaps?.disable,
    },
    release: {
      ...sentryConfig.unstable_sentryVitePluginOptions?.release,
      ...sentryConfig.release,
    },
  };

  const cliInstance = new SentryCli(null, {
    authToken,
    org,
    project,
    ...sentryConfig.unstable_sentryVitePluginOptions,
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

  if (!sourcemaps?.disable && viteConfig.build.sourcemap !== false) {
    // inject debugIds
    try {
      await cliInstance.execute(
        ['sourcemaps', 'inject', reactRouterConfig.buildDirectory],
        debug ? 'rejectOnError' : false,
      );
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
        live: 'rejectOnError',
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[Sentry] Could not upload sourcemaps', error);
    }
  }
  // delete sourcemaps after upload
  let updatedFilesToDeleteAfterUpload = await sourcemaps?.filesToDeleteAfterUpload;

  // set a default value no option was set
  if (typeof updatedFilesToDeleteAfterUpload === 'undefined') {
    updatedFilesToDeleteAfterUpload = [`${reactRouterConfig.buildDirectory}/**/*.map`];
    debug &&
      // eslint-disable-next-line no-console
      console.info(
        `[Sentry] Automatically setting \`sourceMapsUploadOptions.filesToDeleteAfterUpload: ${JSON.stringify(
          updatedFilesToDeleteAfterUpload,
        )}\` to delete generated source maps after they were uploaded to Sentry.`,
      );
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
            // This is allowed to fail - we just don't do anything
            debug &&
              // eslint-disable-next-line no-console
              console.debug(`An error occurred while attempting to delete asset: ${filePathToDelete}`, e);
          }),
        ),
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error deleting files after sourcemap upload:', error);
    }
  }
};
