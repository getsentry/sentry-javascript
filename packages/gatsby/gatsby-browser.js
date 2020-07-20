exports.onClientEntry = function(_, pluginParams) {
  require.ensure(['@sentry/react'], function(require) {
    const Sentry = require('@sentry/react');

    let TracingIntegration = undefined;
    let BrowserTracingIntegration = undefined;
    try {
      BrowserTracingIntegration = require('@sentry/tracing').Integrations.BrowserTracing;
    } catch (_) {}
    try {
      /** @deprecated Remove when @sentry/apm is no longer used */
      TracingIntegration = require('@sentry/apm').Integrations.Tracing;
    } catch (_) {}

    const tracesSampleRate = pluginParams.tracesSampleRate !== undefined ? pluginParams.tracesSampleRate : 0;
    const integrations = [...(pluginParams.integrations || [])];

    if (tracesSampleRate) {
      if (BrowserTracingIntegration) {
        integrations.push(new BrowserTracingIntegration());
      } else if (TracingIntegration) {
        integrations.push(new TracingIntegration());
      }
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
