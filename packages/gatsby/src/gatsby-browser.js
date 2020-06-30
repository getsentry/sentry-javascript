exports.onClientEntry = function(_, pluginParams) {
  require.ensure(['@sentry/react', '@sentry/apm'], function(require) {
    const Sentry = require('@sentry/react');
    const TracingIntegration = require('@sentry/apm').Integrations.Tracing;
    const tracesSampleRate = pluginParams.tracesSampleRate !== undefined ? pluginParams.tracesSampleRate : 0;
    const integrations = [...(pluginParams.integrations || [])];
    if (tracesSampleRate) {
      integrations.push(new TracingIntegration());
    }
    Sentry.init({
      environment: process.env.NODE_ENV || 'development',
      release: __SENTRY_RELEASE__,
      dsn: __SENTRY_DSN__,
      ...pluginParams,
      tracesSampleRate,
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
  });
};
