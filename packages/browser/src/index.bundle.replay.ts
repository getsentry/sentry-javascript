// This is exported so the loader does not fail when switching off Replay/Tracing
import { BrowserTracing, Feedback, addTracingExtensions } from '@sentry-internal/integration-shims';
import { Replay } from '@sentry/replay';

import * as Sentry from './index.bundle.base';

// TODO (v8): Remove this as it was only needed for backwards compatibility
Sentry.Integrations.Replay = Replay;

Sentry.Integrations.BrowserTracing = BrowserTracing;

export * from './index.bundle.base';
export { BrowserTracing, addTracingExtensions, Replay, Feedback };
// Note: We do not export a shim for `Span` here, as that is quite complex and would blow up the bundle
