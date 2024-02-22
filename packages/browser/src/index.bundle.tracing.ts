// This is exported so the loader does not fail when switching off Replay
import {
  BrowserTracingShim,
  FeedbackShim,
  ReplayShim,
  feedbackIntegrationShim,
  replayIntegrationShim,
} from '@sentry-internal/integration-shims';
import { addExtensionMethods, browserTracingIntegration } from '@sentry-internal/tracing';

import * as Sentry from './index.bundle.base';

// TODO(v8): Remove this as it was only needed for backwards compatibility
// We want replay to be available under Sentry.Replay, to be consistent
// with the NPM package version.
// eslint-disable-next-line deprecation/deprecation
Sentry.Integrations.Replay = ReplayShim;

// We are patching the global object with our hub extension methods
addExtensionMethods();

export {
  // eslint-disable-next-line deprecation/deprecation
  FeedbackShim as Feedback,
  // eslint-disable-next-line deprecation/deprecation
  ReplayShim as Replay,
  feedbackIntegrationShim as feedbackIntegration,
  replayIntegrationShim as replayIntegration,
  // eslint-disable-next-line deprecation/deprecation
  BrowserTracingShim as BrowserTracing,
  browserTracingIntegration,
  addExtensionMethods,
};
export * from './index.bundle.base';
