import {
  channelIntegrations,
  getInjectedOrchestrionInstrumentations,
  isOrchestrionInjected,
  ioredisChannelIntegration,
  redisChannelIntegration,
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
    // Install the module hooks FIRST, so `isOrchestrionInjected(name)` below
    // reflects exactly which instrumentations made it into the transform. This
    // runs at `resolve()` time, before `init()`'s own `register()` call (a
    // no-op second time), and before the app imports its instrumented modules.
    registerDiagnosticsChannelInjection();

    // Each channel integration 1:1 replaces the OTel integration of the same name.
    // Built-in ones are always in the transform base, so they always replace.
    // Externally-injected ones (e.g. `@sentry/nestjs`'s `Nest`) only replace their
    // OTel counterpart when their transform was ACTUALLY installed — otherwise a
    // bare `@sentry/node/import` hook that froze the transform list before
    // `@sentry/nestjs` registered would strip the OTel `Nest` and leave nothing.
    const builtins = Object.values(channelIntegrations).map(createIntegration => createIntegration());
    const injected = getInjectedOrchestrionInstrumentations()
      .filter(descriptor => isOrchestrionInjected(descriptor.name))
      .map(descriptor => descriptor.integration());
    const integrations = [...builtins, ...injected];
    const replacedOtelIntegrationNames = integrations.map(i => i.name);

    return {
      // ioredis and redis are wired separately (not in `channelIntegrations`): they need the node
      // redis cache `responseHook` and only partially replace the composite OTel `Redis` integration,
      // so they're kept OUT of `replacedOtelIntegrationNames` — `Redis` must stay (batch + >=5.11 native DC).
      integrations: [
        ...integrations,
        ioredisChannelIntegration({ responseHook: cacheResponseHook }),
        redisChannelIntegration({ responseHook: cacheResponseHook }),
      ],
      replacedOtelIntegrationNames,
      register: registerDiagnosticsChannelInjection,
      detect: detectOrchestrionSetup,
    };
  });
}
