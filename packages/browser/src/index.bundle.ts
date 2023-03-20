// This is exported so the loader does not fail when switching off Replay/Tracing
import { addTracingExtensions, BrowserTracing, Replay } from '@sentry-internal/integration-shims';

import * as Sentry from './index.bundle.base';

// TODO (v8): Remove this as it was only needed for backwards compatibility
Sentry.Integrations.Replay = Replay;

Sentry.Integrations.BrowserTracing = BrowserTracing;

export * from './index.bundle.base';
export { BrowserTracing, addTracingExtensions, Replay };
