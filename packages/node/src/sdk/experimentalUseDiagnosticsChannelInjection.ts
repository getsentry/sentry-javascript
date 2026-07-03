import {
  channelIntegrations,
  ioredisChannelIntegration,
  detectOrchestrionSetup,
} from '@sentry/server-utils/orchestrion';
import { registerDiagnosticsChannelInjection } from '@sentry/server-utils/orchestrion/register';
import { cacheResponseHook } from '../integrations/tracing/redis/cache';
import type { DiagnosticsChannelInjection } from './diagnosticsChannelInjection';
import { setDiagnosticsChannelInjectionLoader } from './diagnosticsChannelInjection';

export function diagnosticsChannelInjectionIntegrations(): typeof channelIntegrations {
  return channelIntegrations;
}

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
    // The registry integrations 1:1 replace the OTel integration of the same name.
    const integrations = Object.values(channelIntegrations).map(createIntegration => createIntegration());
    const replacedOtelIntegrationNames = integrations.map(i => i.name);

    return {
      // ioredis is wired here rather than in the shared `channelIntegrations` registry: it needs
      // the node redis cache `responseHook`, and it only partially replaces the composite OTel
      // `Redis` integration (which also covers node-redis and ioredis >=5.11 native diagnostics_channel).
      // So it's added to the integration set but kept OUT of `replacedOtelIntegrationNames` — `Redis`
      // must stay; its ioredis <5.11 monkey-patch is gated off in `redisIntegration` instead.
      integrations: [...integrations, ioredisChannelIntegration({ responseHook: cacheResponseHook })],
      replacedOtelIntegrationNames,
      register: registerDiagnosticsChannelInjection,
      detect: detectOrchestrionSetup,
    };
  });
}
