// This is exported so the loader does not fail when switching off Replay/Tracing
import {
  FeedbackShim,
  addTracingExtensionsShim,
  browserTracingIntegrationShim,
  feedbackIntegrationShim,
} from '@sentry-internal/integration-shims';
import { Replay, replayIntegration } from '@sentry/replay';

import * as Sentry from './index.bundle.base';

// TODO (v8): Remove this as it was only needed for backwards compatibility
// eslint-disable-next-line deprecation/deprecation
Sentry.Integrations.Replay = Replay;

export * from './index.bundle.base';
export {
  browserTracingIntegrationShim as browserTracingIntegration,
  addTracingExtensionsShim as addTracingExtensions,
  // eslint-disable-next-line deprecation/deprecation
  Replay,
  replayIntegration,
  // eslint-disable-next-line deprecation/deprecation
  FeedbackShim as Feedback,
  feedbackIntegrationShim as feedbackIntegration,
};
// Note: We do not export a shim for `Span` here, as that is quite complex and would blow up the bundle
