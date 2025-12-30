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

  const unstableSentryVitePluginOptions = sentryConfig.unstable_sentryVitePluginOptions;

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
    ...unstableSentryVitePluginOptions,
    ...sentryConfigWithoutDeprecatedSourceMapOption, // spread in the config without the deprecated sourceMapsUploadOptions
    sourcemaps: {
      ...unstableSentryVitePluginOptions?.sourcemaps,
      ...sentryConfig.sourcemaps,
      ...sourceMapsUploadOptions,
      // eslint-disable-next-line deprecation/deprecation
      disable: sourceMapsUploadOptions?.enabled === false ? true : sentryConfig.sourcemaps?.disable,
    },
    release: {
      ...unstableSentryVitePluginOptions?.release,
      ...sentryConfig.release,
    },
    project: unstableSentryVitePluginOptions?.project
      ? Array.isArray(unstableSentryVitePluginOptions?.project)
        ? unstableSentryVitePluginOptions?.project[0]
        : unstableSentryVitePluginOptions?.project
      : sentryConfigWithoutDeprecatedSourceMapOption.project,
  };

  const cliInstance = new SentryCli(null, {
    authToken,
    org,
    ...sentryConfig.unstable_sentryVitePluginOptions,
    // same handling as in bundler plugins: https://github.com/getsentry/sentry-javascript-bundler-plugins/blob/05084f214c763a05137d863ff5a05ef38254f68d/packages/bundler-plugin-core/src/build-plugin-manager.ts#L102-L103
    project: Array.isArray(project) ? project[0] : project,
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
