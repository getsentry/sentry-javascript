const fs = require('fs');

const { hasSourceMapUploadCredentials } = require('@sentry/bundler-plugins/core');
const { sentryWebpackPlugin } = require('@sentry/bundler-plugins/webpack');
const { consoleSandbox, resolveSourceMapsFeatures, warnOnConflictingSourceMapOptions } = require('@sentry/core');

const SENTRY_USER_CONFIG = ['./sentry.config.js', './sentry.config.ts'];

// Gatsby calls `onCreateWebpackConfig` once per build stage.
let warnedAboutDeleteOptions = false;
let warnedAboutFlatDeleteOption = false;

exports.onCreateWebpackConfig = ({ getConfig, actions, stage }, options) => {
  const enableClientWebpackPlugin = options.enableClientWebpackPlugin !== false;
  if (process.env.NODE_ENV === 'production' && enableClientWebpackPlugin) {
    const prevSourceMapSetting = getConfig() && 'devtool' in getConfig() ? getConfig().devtool : undefined;
    const { injectDebugIds, upload } = resolveSourceMapsFeatures(options.sourcemaps);
    const sourcemaps = options.sourcemaps;
    // Gatsby reads no other `sourcemaps` options.
    warnOnConflictingSourceMapOptions(
      sourcemaps && {
        disable: sourcemaps.disable,
        upload: sourcemaps.upload,
        injectDebugIds: sourcemaps.injectDebugIds,
        delete: sourcemaps.delete,
      },
    );
    // TODO(v12): Remove along with the flat `deleteSourcemapsAfterUpload`.
    if (options.deleteSourcemapsAfterUpload !== undefined && !warnedAboutFlatDeleteOption) {
      warnedAboutFlatDeleteOption = true;
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.warn(
          '[Sentry] `deleteSourcemapsAfterUpload` is deprecated and will be removed in the next major version. Use `sourcemaps.delete` instead.',
        );
      });
    }
    // `sourcemaps.delete` replaces the flat `deleteSourcemapsAfterUpload`.
    const deleteOption = options.sourcemaps?.delete ?? options.deleteSourcemapsAfterUpload;
    if (
      options.sourcemaps?.delete !== undefined &&
      options.deleteSourcemapsAfterUpload !== undefined &&
      !warnedAboutDeleteOptions
    ) {
      warnedAboutDeleteOptions = true;
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.warn(
          '[Sentry] `deleteSourcemapsAfterUpload` is ignored because `sourcemaps.delete` is set. Please remove `deleteSourcemapsAfterUpload`.',
        );
      });
    }
    // Sentry turns source maps on to upload them, or when `sourcemaps.delete: false` keeps them for a manual upload.
    // The plugin gets no credentials from these options, only from the environment.
    const shouldAutomaticallyEnableSourceMaps =
      prevSourceMapSetting !== 'source-map' &&
      prevSourceMapSetting !== 'hidden-source-map' &&
      ((upload && hasSourceMapUploadCredentials(undefined)) ||
        (options.sourcemaps?.delete === false && injectDebugIds));

    // Gatsby reads the `build-html` maps in `.cache` to map HTML render errors. The plugin does not
    // get `sourcemaps.delete` itself, because it would also remove those.
    const deleteSourcemapsAfterUpload =
      stage === 'build-javascript' && (deleteOption || (deleteOption !== false && shouldAutomaticallyEnableSourceMaps))
        ? true
        : undefined;

    if (shouldAutomaticallyEnableSourceMaps) {
      // eslint-disable-next-line no-console
      console.log(
        `[Sentry] Automatically enabling source map generation by setting \`devtool: "hidden-source-map"\`. ${
          deleteSourcemapsAfterUpload
            ? 'Those source maps will be deleted after they were uploaded to Sentry'
            : 'Those source maps stay in the build output'
        }`,
      );
    }

    actions.setWebpackConfig({
      devtool: shouldAutomaticallyEnableSourceMaps ? 'hidden-source-map' : prevSourceMapSetting,
      plugins: [
        sentryWebpackPlugin({
          sourcemaps: {
            // Only include files from the build output directory
            assets: ['./public/**'],
            upload: options.sourcemaps?.upload,
            injectDebugIds: options.sourcemaps?.injectDebugIds,
            sdkDeleteSourceMaps: deleteSourcemapsAfterUpload,
            // Ignore files that aren't users' source code related
            ignore: [
              'polyfill-*', // related to polyfills
              'framework-*', // related to the frameworks (e.g. React)
              'webpack-runtime-*', // related to Webpack
            ],
          },
          // Handle sentry-cli configuration errors when the user has not done it not to break
          // the build.
          errorHandler(err) {
            const message = (err.message && err.message.toLowerCase()) || '';
            if (message.includes('organization slug is required') || message.includes('project slug is required')) {
              // eslint-disable-next-line no-console
              console.log(
                'Sentry [Info]: Not uploading source maps due to missing SENTRY_ORG and SENTRY_PROJECT env variables.',
              );
              return;
            }
            if (message.includes('authentication credentials were not provided')) {
              // eslint-disable-next-line no-console
              console.warn('Sentry [Warn]: Cannot upload source maps due to missing SENTRY_AUTH_TOKEN env variable.');
              return;
            }
            throw err;
          },
        }),
      ],
    });
  }

  // To configure the SDK, SENTRY_USER_CONFIG is prioritized over `gatsby-config.js`,
  // since it isn't possible to set non-serializable parameters in the latter.
  // Prioritization here means what `init` is run.
  let configFile = null;
  try {
    configFile = SENTRY_USER_CONFIG.find(file => fs.existsSync(file));
  } catch {
    // Some node versions (like v11) throw an exception on `existsSync` instead of
    // returning false. See https://github.com/tschaub/mock-fs/issues/256
  }

  if (!configFile) {
    return;
  }
  // `setWebpackConfig` merges the Webpack config, ignoring some props like `entry`. See
  // https://www.gatsbyjs.com/docs/reference/config-files/actions/#setWebpackConfig
  // So it's not possible to inject the Sentry properties with that method. Instead, we
  // can replace the whole config with the modifications we need.
  const finalConfig = injectSentryConfig(getConfig(), configFile);
  actions.replaceWebpackConfig(finalConfig);
};

function injectSentryConfig(config, configFile) {
  const injectedEntries = {};
  // TODO: investigate what entries need the Sentry config injected.
  //    We may want to skip some.
  Object.keys(config.entry).forEach(prop => {
    const value = config.entry[prop];
    let injectedValue = value;
    if (typeof value === 'string') {
      injectedValue = [configFile, value];
    } else if (Array.isArray(value)) {
      injectedValue = [configFile, ...value];
    } else {
      // eslint-disable-next-line no-console
      console.error(
        `Sentry [Error]: Could not inject SDK initialization code into ${prop}, unexpected format: `,
        typeof value,
      );
    }
    injectedEntries[prop] = injectedValue;
  });
  return { ...config, entry: injectedEntries };
}
