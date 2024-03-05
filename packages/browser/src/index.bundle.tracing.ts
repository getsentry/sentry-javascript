// This is exported so the loader does not fail when switching off Replay
import {
  FeedbackShim,
  ReplayShim,
  feedbackIntegrationShim,
  replayIntegrationShim,
} from '@sentry-internal/integration-shims';
import { browserTracingIntegration } from '@sentry-internal/tracing';
import { addTracingExtensions } from '@sentry/core';

import * as Sentry from './index.bundle.base';

// TODO(v8): Remove this as it was only needed for backwards compatibility
// We want replay to be available under Sentry.Replay, to be consistent
// with the NPM package version.
// eslint-disable-next-line deprecation/deprecation
Sentry.Integrations.Replay = ReplayShim;

// We are patching the global object with our hub extension methods
addTracingExtensions();

export {
  getActiveSpan,
  startSpan,
  startInactiveSpan,
  startSpanManual,
  withActiveSpan,
  getSpanDescendants,
} from '@sentry/core';

export {
  // eslint-disable-next-line deprecation/deprecation
  FeedbackShim as Feedback,
  // eslint-disable-next-line deprecation/deprecation
  ReplayShim as Replay,
  feedbackIntegrationShim as feedbackIntegration,
  replayIntegrationShim as replayIntegration,
  browserTracingIntegration,
  addTracingExtensions,
};
export * from './index.bundle.base';
