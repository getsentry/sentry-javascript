import {
  mysqlChannelIntegration,
  lruMemoizerChannelIntegration,
  ioredisChannelIntegration,
  detectOrchestrionSetup,
} from '@sentry/server-utils/orchestrion';
import { registerDiagnosticsChannelInjection } from '@sentry/server-utils/orchestrion/register';
import { cacheResponseHook } from '../integrations/tracing/redis';
import type { DiagnosticsChannelInjection } from './diagnosticsChannelInjection';
import { setDiagnosticsChannelInjectionLoader } from './diagnosticsChannelInjection';

/**
 * EXPERIMENTAL: opt into diagnostics-channel-based auto-instrumentation.
 *
 * Call this BEFORE `Sentry.init()`:
 *
 * ```ts
 * import * as Sentry from '@sentry/node';
 *
 * Sentry.experimentalUseDiagnosticsChannelInjection();
 * Sentry.init({
 *   dsn: '__DSN__',
 *   // other settings...
 * });
 * ```
 *
 * When this has been called AND span recording is enabled, `Sentry.init()`
 * uses the diagnostics-channel-injection-based integrations instead of the
 * OpenTelemetry ones, and installs the module hooks that inject the channels
 * (so libraries imported after `init()` publish the channel events).
 *
 * This is a standalone function rather than an `init()` option so that a
 * bundler drops all of it (and its transitive deps) when this function isn't
 * called. `init()` reads the loader registered below.
 *
 * An app that DOES call it gets the orchestrion code bundled as intended.
 *
 * In an unbundled (server-side runtime) app this eagerly loads only the small
 * subscriber/channel modules; the heavy code-transform dependencies stay lazy
 * inside `register()` and load only when injection actually runs.
 *
 * @experimental May change or be removed in any release.
 */
export function experimentalUseDiagnosticsChannelInjection(): void {
  setDiagnosticsChannelInjectionLoader((): DiagnosticsChannelInjection => {
    // These channel integrations 1:1 replace the OTel integration of the same name.
    const replacements = [mysqlChannelIntegration(), lruMemoizerChannelIntegration()] as const;

    return {
      // ioredis only supersedes the ioredis monkey-patch inside the composite OTel
      // `Redis` integration (gated off in `redisIntegration`), so it's added here
      // but kept out of `replacedOtelIntegrationNames` — `Redis` must stay.
      integrations: [...replacements, ioredisChannelIntegration({ responseHook: cacheResponseHook })],
      replacedOtelIntegrationNames: replacements.map(i => i.name),
      register: registerDiagnosticsChannelInjection,
      detect: detectOrchestrionSetup,
    };
  });
}
