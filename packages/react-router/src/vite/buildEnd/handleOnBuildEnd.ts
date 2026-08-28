import { rm } from 'node:fs/promises';
import type { Config } from '@react-router/dev/config';
import { createSentrySDK } from 'sentry';
import type { SentryVitePluginOptions } from '@sentry/bundler-plugins/vite';
import { glob } from 'glob';
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

  const sentryOptions: SentryOptionsWithHeaders = {
    token: authToken,
    org,
    url: sentryUrl,
    project,
    headers,
  };

  const sentry = createSentrySDK(sentryOptions);

  // check if release should be created
  if (release?.name) {
    try {
      await sentry.release.create({ orgVersion: release.name });
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
      await sentry.sourcemap.inject({ directory: reactRouterConfig.buildDirectory });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[Sentry] Could not inject debug ids', error);
    }

    if (!uploadDisabled) {
      // upload sourcemaps
      try {
        await sentry.sourcemap.upload({
          directory: reactRouterConfig.buildDirectory,
          release: release?.name || 'undefined',
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
