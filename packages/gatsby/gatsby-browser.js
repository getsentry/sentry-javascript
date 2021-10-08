const Sentry = require('@sentry/gatsby');

exports.onClientEntry = function(_, pluginParams) {
  if (pluginParams === undefined) {
    return;
  }

  Sentry.init({
    release: __SENTRY_RELEASE__,
    dsn: __SENTRY_DSN__,
    ...pluginParams,
  });

  window.Sentry = Sentry;
};
