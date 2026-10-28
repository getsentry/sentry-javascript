import * as Sentry from '@sentry/browser';
import { addLcpInstrumentationHandler } from '@sentry/browser-utils';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1,
});

// Registered in the bundle of the SDK, so the handlers share its LCP observer. A second bundle gets
// a copy of the instrumentation with an observer of its own, whose view of the LCP candidates can
// differ from the SDK's (e.g. a different first-hidden time), which made this test flaky.
addLcpInstrumentationHandler(({ metric }) => {
  const entry = metric.entries[metric.entries.length - 1];
  window._LCP = entry.size;
});

addLcpInstrumentationHandler(({ metric }) => {
  const entry = metric.entries[metric.entries.length - 1];
  window._LCP2 = entry.size;
});

window.ADD_HANDLER = () => {
  addLcpInstrumentationHandler(({ metric }) => {
    const entry = metric.entries[metric.entries.length - 1];
    window._LCP3 = entry.size;
  });
};
