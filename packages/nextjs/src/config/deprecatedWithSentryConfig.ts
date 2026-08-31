import { consoleSandbox } from '@sentry/core';
import type { SentryBuildOptions } from './types';
import { withSentryConfig as withSentryConfigImpl } from './withSentryConfig';

let hasWarned = false;

/**
 * Deprecation shim for the `withSentryConfig` re-export on the `@sentry/nextjs` entry. Kept separate from
 * `./config` so that importing from `@sentry/nextjs/config` stays silent.
 */
export function withSentryConfig<C>(nextConfig?: C, sentryBuildOptions: SentryBuildOptions = {}): C {
  if (!hasWarned) {
    hasWarned = true;
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        '[@sentry/nextjs] Importing `withSentryConfig` from `@sentry/nextjs` is deprecated and will stop working in v11. Import it from `@sentry/nextjs/config` instead:\n' +
          "  import { withSentryConfig } from '@sentry/nextjs/config';",
      );
    });
  }

  return withSentryConfigImpl(nextConfig, sentryBuildOptions);
}
