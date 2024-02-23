import { Feedback, feedbackIntegration } from '@sentry-internal/integration-shims';
import { BrowserTracing } from '@sentry-internal/tracing';
import { addTracingExtensions } from '@sentry/core';
import { Replay, replayIntegration } from '@sentry/replay';
import { bundleBrowserTracingIntegration as browserTracingIntegration } from './helpers';

import * as Sentry from './index.bundle.base';

// TODO (v8): Remove this as it was only needed for backwards compatibility
// We want replay to be available under Sentry.Replay, to be consistent
// with the NPM package version.
// eslint-disable-next-line deprecation/deprecation
Sentry.Integrations.Replay = Replay;

// eslint-disable-next-line deprecation/deprecation
Sentry.Integrations.BrowserTracing = BrowserTracing;

// We are patching the global object with our hub extension methods
addTracingExtensions();

export {
  // eslint-disable-next-line deprecation/deprecation
  Feedback,
  // eslint-disable-next-line deprecation/deprecation
  Replay,
  replayIntegration,
  feedbackIntegration,
  // eslint-disable-next-line deprecation/deprecation
  BrowserTracing,
  browserTracingIntegration,
  addTracingExtensions,
};
export * from './index.bundle.base';
