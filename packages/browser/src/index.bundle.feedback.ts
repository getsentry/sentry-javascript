// This is exported so the loader does not fail when switching off Replay/Tracing
import { Feedback } from '@sentry-internal/feedback';
import { BrowserTracing, Replay, ReplayCanvas, addTracingExtensions } from '@sentry-internal/integration-shims';

import * as Sentry from './index.bundle.base';

// TODO (v8): Remove this as it was only needed for backwards compatibility
Sentry.Integrations.Replay = Replay;

Sentry.Integrations.BrowserTracing = BrowserTracing;

export * from './index.bundle.base';
export { BrowserTracing, addTracingExtensions, Replay, ReplayCanvas, Feedback };
// Note: We do not export a shim for `Span` here, as that is quite complex and would blow up the bundle
