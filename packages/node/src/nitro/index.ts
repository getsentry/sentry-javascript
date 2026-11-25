import { createSentryNitroModule } from '@sentry/server-utils/nitro';
import type { SentryNitroModule, SentryNitroOptions } from '@sentry/server-utils/nitro';

export type { SentryNitroModule, SentryNitroOptions };

/**
 * Nitro module that sets up Sentry for a Nitro app on Node.js. It imports `sentry.server.config.ts` before the
 * app's other plugins, captures the errors of the app and its tasks, turns on Nitro's tracing channels, and adds
 * the build-time instrumentation of server-side dependencies.
 *
 * @example
 * ```ts
 * // nitro.config.ts
 * import { sentryNitro } from '@sentry/node/nitro';
 * export default defineNitroConfig({ modules: [sentryNitro()] });
 *
 * // sentry.server.config.ts
 * import * as Sentry from '@sentry/node';
 * Sentry.init({ dsn: '__DSN__', tracesSampleRate: 1 });
 * ```
 */
export function sentryNitro(options: SentryNitroOptions = {}): SentryNitroModule {
  return createSentryNitroModule(options, { runtimeModule: '@sentry/node/nitro/runtime' });
}
