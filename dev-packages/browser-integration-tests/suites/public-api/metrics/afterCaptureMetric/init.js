import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0.0',
  environment: 'test',
  integrations: integrations => {
    return integrations.filter(integration => integration.name !== 'BrowserSession');
  },
  beforeSendMetric: metric => {
    if (metric.name === 'test.counter') {
      return {
        ...metric,
        attributes: {
          ...metric.attributes,
          modified: 'by-beforeSendMetric',
          original: undefined,
        },
      };
    }
    return metric;
  },
});
