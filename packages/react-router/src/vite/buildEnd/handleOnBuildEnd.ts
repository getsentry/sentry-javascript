import { rm } from 'node:fs/promises';
import type { Config } from '@react-router/dev/config';
import SentryCli from '@sentry/cli';
import type { SentryVitePluginOptions } from '@sentry/bundler-plugins/vite';
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
      disable: sentryConfig.sourcemaps?.disable,
    },
    release: {
      ...sentryConfig.release,
    },
  };

  // `url` and `headers` previously only reached the CLI through `unstable_sentryVitePluginOptions`,
  // so self-hosted setups had no supported way to point this upload at their instance.
  const cliInstance = new SentryCli(null, {
    authToken,
    headers,
    org,
    project,
    url: sentryUrl,
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

  // `disable: 'disable-upload'` still injects debug IDs, so that source maps can be
  // uploaded manually at a later point - only `true` turns source maps off entirely.
  const sourceMapsFullyDisabled = sourcemaps?.disable === true;
  const uploadDisabled = sourceMapsFullyDisabled || sourcemaps?.disable === 'disable-upload';

  if (!sourceMapsFullyDisabled && viteConfig.build.sourcemap !== false) {
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

    if (!uploadDisabled) {
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
  }

  // Only clean up source maps that were actually uploaded. Deleting them after skipping
  // the upload would leave the user with neither, breaking a manual upload.
  if (uploadDisabled) {
    return;
  }

  // delete sourcemaps after upload
  let updatedFilesToDeleteAfterUpload = await sourcemaps?.filesToDeleteAfterUpload;

  // set a default value no option was set
  if (typeof updatedFilesToDeleteAfterUpload === 'undefined') {
    updatedFilesToDeleteAfterUpload = [`${reactRouterConfig.buildDirectory}/**/*.map`];
    debug &&
      // eslint-disable-next-line no-console
      console.info(
        `[Sentry] Automatically setting \`sourcemaps.filesToDeleteAfterUpload: ${JSON.stringify(
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
