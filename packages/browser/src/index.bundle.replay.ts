// This is exported so the loader does not fail when switching off Replay/Tracing
import {
  BrowserTracing,
  Feedback,
  addTracingExtensions,
  feedbackIntegration,
} from '@sentry-internal/integration-shims';
import { Replay, replayIntegration } from '@sentry/replay';

import * as Sentry from './index.bundle.base';

// TODO (v8): Remove this as it was only needed for backwards compatibility
// eslint-disable-next-line deprecation/deprecation
Sentry.Integrations.Replay = Replay;

Sentry.Integrations.BrowserTracing = BrowserTracing;

export * from './index.bundle.base';
export {
  BrowserTracing,
  addTracingExtensions,
  // eslint-disable-next-line deprecation/deprecation
  Replay,
  replayIntegration,
  // eslint-disable-next-line deprecation/deprecation
  Feedback,
  feedbackIntegration,
};
// Note: We do not export a shim for `Span` here, as that is quite complex and would blow up the bundle
