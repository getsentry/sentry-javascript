const fs = require('fs');

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

  // To configure the SDK, SENTRY_USER_CONFIG is prioritized over `gatsby-config.js`,
  // since it isn't possible to set non-serializable parameters in the latter.
  // Prioritization here means what `init` is being run first.
  const configFile = SENTRY_USER_CONFIG.find(file => fs.existsSync(file));
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
  Object.keys(config.entry).map(prop => {
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
