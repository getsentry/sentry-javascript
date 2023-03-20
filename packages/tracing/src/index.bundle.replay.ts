import { Replay } from '@sentry/browser';

import * as Sentry from './index.bundle.base';

// TODO (v8): Remove this as it was only needed for backwards compatibility
// We want replay to be available under Sentry.Replay, to be consistent
// with the NPM package version.
Sentry.Integrations.Replay = Replay;

export { Replay };
export * from './index.bundle.base';
