import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration(), Sentry.spanStreamingIntegration()],
  tracesSampleRate: 1,
  beforeSendSpan: Sentry.withStreamedSpan(span => {
    if (span.attributes['sentry.op'] === 'pageload') {
      span.name = 'customPageloadSpanName';
      span.links = [
        {
          context: {
            traceId: '123',
            spanId: '456',
          },
          attributes: {
            'sentry.link.type': 'custom_link',
          },
        },
      ];
      span.attributes['sentry.custom_attribute'] = 'customAttributeValue';
      span.status = 'something';
    }
    return span;
  }),
});
