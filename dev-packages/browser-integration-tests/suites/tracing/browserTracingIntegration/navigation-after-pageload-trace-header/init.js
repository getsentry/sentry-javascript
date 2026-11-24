import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      enableReportPageLoaded: true,
      // Otherwise, the navigation right after the pageload start counts as a redirect
      detectRedirects: false,
    }),
  ],
  tracesSampleRate: 1,
});

const pageloadPropagationContext = Sentry.getCurrentScope().getPropagationContext();
window._pageloadSampleRand = pageloadPropagationContext.sampleRand;

// Record which trace the scope holds when the pageload span envelope is sent
Sentry.getClient().on('beforeEnvelope', envelope => {
  const isSpanEnvelope = envelope[1].some(([itemHeader]) => itemHeader.type === 'span');
  if (isSpanEnvelope && envelope[0].trace?.trace_id === pageloadPropagationContext.traceId) {
    window._scopeTraceIdOnPageloadFlush = Sentry.getCurrentScope().getPropagationContext().traceId;
  }
});

// End the pageload span and start a new trace in the same tick, so both happen before the pageload span is flushed
Sentry.reportPageLoaded();
window.history.pushState({}, '', '/sub-page');
