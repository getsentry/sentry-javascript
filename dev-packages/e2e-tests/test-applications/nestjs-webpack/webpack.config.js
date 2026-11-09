// Extends the Nest CLI's own webpack config (`nest build` with `"webpack": true` in nest-cli.json)
// with the Sentry plugin from `@sentry/nestjs/webpack`. The injected release name shows up on
// every event, which is how the tests know the plugin ran. No auth, upload or telemetry.
const { sentryWebpackPlugin } = require('@sentry/nestjs/webpack');

module.exports = function (options) {
  return {
    ...options,
    plugins: [
      ...options.plugins,
      sentryWebpackPlugin({
        telemetry: false,
        sourcemaps: { disable: true },
        release: { name: 'nestjs-webpack-e2e', create: false, finalize: false },
      }),
    ],
  };
};
