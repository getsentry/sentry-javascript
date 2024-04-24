import { feedbackIntegrationShim } from '@sentry-internal/integration-shims';
import { registerSpanErrorInstrumentation } from '@sentry/core';

registerSpanErrorInstrumentation();

export * from './index.bundle.base';

export {
  getActiveSpan,
  getRootSpan,
  startSpan,
  startInactiveSpan,
  startSpanManual,
  withActiveSpan,
  getSpanDescendants,
  setMeasurement,
} from '@sentry/core';

export {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from './tracing/browserTracingIntegration';

export { feedbackIntegrationShim as feedbackIntegration };

export { replayIntegration } from '@sentry-internal/replay';
