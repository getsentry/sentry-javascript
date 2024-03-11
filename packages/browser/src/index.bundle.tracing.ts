// This is exported so the loader does not fail when switching off Replay
import { feedbackIntegrationShim, replayIntegrationShim } from '@sentry-internal/integration-shims';
import { browserTracingIntegration } from '@sentry-internal/tracing';
import { addTracingExtensions } from '@sentry/core';

// We are patching the global object with our hub extension methods
addTracingExtensions();

export {
  getActiveSpan,
  getRootSpan,
  startSpan,
  startInactiveSpan,
  startSpanManual,
  withActiveSpan,
  getSpanDescendants,
} from '@sentry/core';

export {
  feedbackIntegrationShim as feedbackIntegration,
  replayIntegrationShim as replayIntegration,
  browserTracingIntegration,
  addTracingExtensions,
};

export * from './index.bundle.base';
