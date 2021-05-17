// This file is symlinked into the test app, so that the test app can be updated without worrying about preserving this
// file.

const { withSentryConfig } = require('@sentry/nextjs');
debugger;

const moduleExports = {
  // Your existing module.exports
};

const SentryWebpackPluginOptions = {
  // Additional config options for the Sentry Webpack plugin. Keep in mind that
  // the following options are set automatically, and overriding them is not
  // recommended:
  //   release, url, org, project, authToken, configFile, stripPrefix,
  //   urlPrefix, include, ignore
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options.

  // this keeps us from needing any config for sentry-cli, since it prevents the creating of releases and the uploading
  // of sourcemaps
  dryRun: true,
};

// Make sure adding Sentry options is the last code to run before exporting, to
// ensure that your source maps include changes from all other Webpack plugins
module.exports = withSentryConfig(moduleExports, SentryWebpackPluginOptions);
