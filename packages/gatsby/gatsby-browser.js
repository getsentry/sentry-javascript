const Sentry = require('@sentry/react');
const Tracing = require('@sentry/tracing');
const Utils = require('@sentry/utils');

exports.onClientEntry = function(_, pluginParams) {
  if (pluginParams === undefined) {
    return;
  }

  const integrations = [...(pluginParams.integrations || [])];

  if (Utils.hasTracingEnabled(pluginParams) && !integrations.some(ele => ele.name === 'BrowserTracing')) {
    integrations.push(new Tracing.Integrations.BrowserTracing(pluginParams.browserTracingOptions));
  }

  Tracing.addExtensionMethods();

  Sentry.init({
    environment: process.env.NODE_ENV || 'development',
    // eslint-disable-next-line no-undef
    release: __SENTRY_RELEASE__,
    // eslint-disable-next-line no-undef
    dsn: __SENTRY_DSN__,
    ...pluginParams,
    integrations,
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
  window.Sentry = Sentry;
};
