const Sentry = require('@sentry/gatsby');

exports.onClientEntry = function(_, pluginParams) {
  if (pluginParams === undefined) {
    return;
  }

  Sentry.init({
    ...pluginParams,
    // eslint-disable-next-line no-undef
    release: pluginParams.release ? pluginParams.release : __SENTRY_RELEASE__,
    // eslint-disable-next-line no-undef
    dsn: pluginParams.dsn ? pluginParams.dsn : __SENTRY_DSN__,
  });

  window.Sentry = Sentry;
};
