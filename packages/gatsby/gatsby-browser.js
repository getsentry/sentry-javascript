exports.onClientEntry = function(_, pluginParams) {
  require.ensure(['@sentry/react', '@sentry/tracing'], function(require) {
    const Sentry = require('@sentry/react');
    const Tracing = require('@sentry/tracing');
    const tracesSampleRate = pluginParams.tracesSampleRate !== undefined ? pluginParams.tracesSampleRate : 0;
    const integrations = [...(pluginParams.integrations || [])];

    if (tracesSampleRate && !integrations.some(ele => ele.id === 'BrowserTracing')) {
      integrations.push(new Tracing.Integrations.BrowserTracing(pluginParams.browserTracingOptions));
    }
    console.log(pluginParams);

    Sentry.init({
      environment: process.env.NODE_ENV || 'development',
      // eslint-disable-next-line no-undef
      release: __SENTRY_RELEASE__,
      // eslint-disable-next-line no-undef
      dsn: __SENTRY_DSN__,
      beforeSend: event => {
        console.log(event);
        return null;
      },
      ...pluginParams,
      tracesSampleRate,
      integrations,
    });

    Tracing.addExtensionMethods();

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
