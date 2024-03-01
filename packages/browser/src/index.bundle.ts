// This is exported so the loader does not fail when switching off Replay/Tracing
import {
  FeedbackShim,
  ReplayShim,
  addTracingExtensionsShim,
  browserTracingIntegrationShim,
  feedbackIntegrationShim,
  replayIntegrationShim,
} from '@sentry-internal/integration-shims';

import * as Sentry from './index.bundle.base';

// TODO (v8): Remove this as it was only needed for backwards compatibility
// eslint-disable-next-line deprecation/deprecation
Sentry.Integrations.Replay = ReplayShim;

export * from './index.bundle.base';
export {
  addTracingExtensionsShim as addTracingExtensions,
  // eslint-disable-next-line deprecation/deprecation
  ReplayShim as Replay,
  // eslint-disable-next-line deprecation/deprecation
  FeedbackShim as Feedback,
  browserTracingIntegrationShim as browserTracingIntegration,
  feedbackIntegrationShim as feedbackIntegration,
  replayIntegrationShim as replayIntegration,
};
// Note: We do not export a shim for `Span` here, as that is quite complex and would blow up the bundle
