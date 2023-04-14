const fs = require('fs');

const SentryWebpackPlugin = require('@sentry/webpack-plugin');

const sentryRelease = JSON.stringify(
  // Always read first as Sentry takes this as precedence
  process.env.SENTRY_RELEASE ||
    // GitHub Actions - https://help.github.com/en/actions/configuring-and-managing-workflows/using-environment-variables#default-environment-variables
    process.env.GITHUB_SHA ||
    // Netlify - https://docs.netlify.com/configure-builds/environment-variables/#build-metadata
    process.env.COMMIT_REF ||
    // Vercel - https://vercel.com/docs/v2/build-step#system-environment-variables
    process.env.VERCEL_GIT_COMMIT_SHA ||
    // Zeit (now known as Vercel)
    process.env.ZEIT_GITHUB_COMMIT_SHA ||
    process.env.ZEIT_GITLAB_COMMIT_SHA ||
    process.env.ZEIT_BITBUCKET_COMMIT_SHA ||
    undefined,
);

const sentryDsn = JSON.stringify(process.env.SENTRY_DSN || '');
const SENTRY_USER_CONFIG = ['./sentry.config.js', './sentry.config.ts'];

exports.onCreateWebpackConfig = ({ plugins, getConfig, actions }) => {
  actions.setWebpackConfig({
    plugins: [
      plugins.define({
        __SENTRY_RELEASE__: sentryRelease,
        __SENTRY_DSN__: sentryDsn,
      }),
    ],
  });

  if (process.env.NODE_ENV === 'production') {
    actions.setWebpackConfig({
      plugins: [
        new SentryWebpackPlugin({
          // Only include files from the build output directory
          include: 'public',
          // Ignore files that aren't users' source code related
          ignore: [
            'polyfill-*', // related to polyfills
            'framework-*', // related to the frameworks (e.g. React)
            'webpack-runtime-*', // related to Webpack
          ],
          // Handle sentry-cli configuration errors when the user has not done it not to break
          // the build.
          errorHandler(err, invokeErr) {
            const message = err.message && err.message.toLowerCase() || '';
            if (message.includes('organization slug is required') || message.includes('project slug is required')) {
              return;
            }
            if (message.includes('authentication credentials were not provided')) {
              // eslint-disable-next-line no-console
              console.warn('Sentry Logger [Warn]: Cannot upload source maps due to missing SENTRY_AUTH_TOKEN env variable.')
              return;
            }
            invokeErr(err);
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
  } catch (error) {
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
        `Sentry Logger [Error]: Could not inject SDK initialization code into ${prop}, unexpected format: `,
        typeof value,
      );
    }
    injectedEntries[prop] = injectedValue;
  });
  return { ...config, entry: injectedEntries };
}
