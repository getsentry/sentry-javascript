const Sentry = require('@sentry/node');

const sentryRelease = JSON.stringify(
  process.env.SENTRY_RELEASE ||
    // GitHub Actions - https://help.github.com/en/actions/configuring-and-managing-workflows/using-environment-variables#default-environment-variables
    process.env.GITHUB_SHA ||
    // Netlify - https://docs.netlify.com/configure-builds/environment-variables/#build-metadata
    process.env.COMMIT_REF ||
    // Vercel - https://vercel.com/docs/v2/build-step#system-environment-variables
    process.env.VERCEL_GITHUB_COMMIT_SHA ||
    process.env.VERCEL_GITLAB_COMMIT_SHA ||
    process.env.VERCEL_BITBUCKET_COMMIT_SHA ||
    // Zeit (now known as Vercel)
    process.env.ZEIT_GITHUB_COMMIT_SHA ||
    process.env.ZEIT_GITLAB_COMMIT_SHA ||
    process.env.ZEIT_BITBUCKET_COMMIT_SHA ||
    '',
);

const sentryDsn = JSON.stringify(process.env.SENTRY_DSN || '');

exports.onPreBuild = (_, pluginParams) => {
  if (!pluginParams || !pluginParams.trackBuild) {
    return;
  }

  Sentry.init({
    environment: process.env.NODE_ENV || 'development',
    // eslint-disable-next-line no-undef
    release: sentryRelease,
    // eslint-disable-next-line no-undef
    dsn: __SENTRY_DSN__,
    ...pluginParams,
  });

  Sentry.addGlobalEventProcessor(event => {
    event.sdk = {
      ...event.sdk,
      name: 'sentry.javascript.gatsby',
      packages: [
        ...((event.sdk && event.sdk.packages) || []),
        {
          name: 'npm:@sentry/gatsby',
          version: Sentry.SDK_VERSION,
        },
      ],
      version: Sentry.SDK_VERSION,
    };
    return event;
  });
};

exports.onCreateWebpackConfig = ({ plugins, actions }) => {
  actions.setWebpackConfig({
    plugins: [
      plugins.define({
        __SENTRY_RELEASE__: sentryRelease,
        __SENTRY_DSN__: sentryDsn,
      }),
    ],
  });
};
