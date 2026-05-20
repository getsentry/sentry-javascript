import * as Sentry from '@sentry/react';

export function initSentry(): void {
  // enabled: false makes the SDK a guaranteed no-op (no transport allocation,
  // no DSN warning). We're measuring pure SDK-loading + tree-shaking cost.
  Sentry.init({ enabled: false });
}
