import * as Sentry from '@sentry/aws-serverless';

const optionsWithTracingEnabled = process.env.SENTRY_TRACES_SAMPLE_RATE
  ? {
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE),
    }
  : {};

Sentry.init({
  integrations: Sentry.getDefaultIntegrations(optionsWithTracingEnabled),
  _experiments: {
    useSentryTraceProvider: true,
  },
});
