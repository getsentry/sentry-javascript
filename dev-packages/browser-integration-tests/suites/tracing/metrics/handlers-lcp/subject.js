import { addLcpInstrumentationHandler } from '@sentry-internal/browser-utils';

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
