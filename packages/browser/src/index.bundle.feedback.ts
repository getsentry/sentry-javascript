// This is exported so the loader does not fail when switching off Replay/Tracing
import { Feedback, feedbackIntegration } from '@sentry-internal/feedback';
import {
  ReplayShim,
  addTracingExtensionsShim,
  browserTracingIntegrationShim,
  replayIntegrationShim,
} from '@sentry-internal/integration-shims';

import * as Sentry from './index.bundle.base';

// TODO (v8): Remove this as it was only needed for backwards compatibility
// eslint-disable-next-line deprecation/deprecation
Sentry.Integrations.Replay = ReplayShim;

export * from './index.bundle.base';
export {
  browserTracingIntegrationShim as browserTracingIntegration,
  addTracingExtensionsShim as addTracingExtensions,
  // eslint-disable-next-line deprecation/deprecation
  ReplayShim as Replay,
  replayIntegrationShim as replayIntegration,
  // eslint-disable-next-line deprecation/deprecation
  Feedback,
  feedbackIntegration,
};
// Note: We do not export a shim for `Span` here, as that is quite complex and would blow up the bundle
