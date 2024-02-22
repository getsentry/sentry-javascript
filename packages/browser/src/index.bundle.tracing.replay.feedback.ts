import { Feedback, feedbackIntegration } from '@sentry-internal/feedback';
import { BrowserTracingShim } from '@sentry-internal/integration-shims';
import { addExtensionMethods, browserTracingIntegration } from '@sentry-internal/tracing';
import { Replay, replayIntegration } from '@sentry/replay';

import * as Sentry from './index.bundle.base';

// TODO (v8): Remove this as it was only needed for backwards compatibility
// We want replay to be available under Sentry.Replay, to be consistent
// with the NPM package version.
// eslint-disable-next-line deprecation/deprecation
Sentry.Integrations.Replay = Replay;

// We are patching the global object with our hub extension methods
addExtensionMethods();

export {
  // eslint-disable-next-line deprecation/deprecation
  Feedback,
  // eslint-disable-next-line deprecation/deprecation
  Replay,
  feedbackIntegration,
  replayIntegration,
  // eslint-disable-next-line deprecation/deprecation
  BrowserTracingShim as BrowserTracing,
  browserTracingIntegration,
  addExtensionMethods,
};
export * from './index.bundle.base';
