const Sentry = require('@sentry/react');
const Tracing = require('@sentry/tracing');

exports.onClientEntry = function(_, pluginParams) {
  if (pluginParams === undefined) {
    return;
  }

  pluginParams._metadata = pluginParams._metadata || {};
  pluginParams._metadata.sdk = {
    name: 'sentry.javascript.gatsby',
    packages: [
      {
        name: 'npm:@sentry/gatsby',
        version: Sentry.SDK_VERSION,
      },
    ],
    version: Sentry.SDK_VERSION,
  };

  const integrations = [...(pluginParams.integrations || [])];

  if (Tracing.hasTracingEnabled(pluginParams) && !integrations.some(ele => ele.name === 'BrowserTracing')) {
    integrations.push(new Tracing.Integrations.BrowserTracing(pluginParams.browserTracingOptions));
  }

  Tracing.addExtensionMethods();

  Sentry.init({
    autoSessionTracking: true,
    environment: process.env.NODE_ENV || 'development',
    // eslint-disable-next-line no-undef
    release: __SENTRY_RELEASE__,
    // eslint-disable-next-line no-undef
    dsn: __SENTRY_DSN__,
    ...pluginParams,
    integrations,
  });

  window.Sentry = Sentry;
};
