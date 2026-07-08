import type { FunctionKind, InstrumentationConfig } from '@apm-js-collab/code-transformer';
import type { IntegrationFn } from '@sentry/core';

export type { FunctionKind, InstrumentationConfig };

declare global {
  // eslint-disable-next-line no-var
  var __SENTRY_ORCHESTRION__:
    | { runtime?: boolean; bundler?: boolean; registry?: OrchestrionInstrumentation[] }
    | undefined;
}

/**
 * A self-contained orchestrion instrumentation contributed by an SDK package.
 *
 * Bundles the three pieces a diagnostics-channel instrumentation needs:
 * - `configs`: the code-transform configs (consumed at startup/bundler time),
 * - `integration`: the channel-subscriber span-emitting integration factory.
 *
 * A package that owns its own instrumentation (e.g. `@sentry/nestjs`) defines
 * one of these and injects it via {@link registerOrchestrionInstrumentation}
 * (runtime) and by passing it to the bundler plugin's `instrumentations`
 * option (build time), so `@sentry/server-utils` never has to depend on that
 * package.
 */
export interface OrchestrionInstrumentation {
  name: string;
  configs: InstrumentationConfig[];
  integration: IntegrationFn;
}

/**
 * Inject an externally-defined orchestrion instrumentation into the shared
 * assembly. Must be called before the runtime hook registers (see
 * `registerDiagnosticsChannelInjection`) and before the Node SDK builds its
 * channel-integration list.
 *
 * Backed by `globalThis` (not a module-scoped array) so the CJS copy of this
 * module that `Sentry.init()` `require()`s synchronously and the ESM copy an
 * injecting package imports share one store. Idempotent per `name`.
 */
export function registerOrchestrionInstrumentation(instrumentation: OrchestrionInstrumentation): void {
  const g = (globalThis.__SENTRY_ORCHESTRION__ ??= {});
  const registry = (g.registry ??= []);
  if (!registry.some(existing => existing.name === instrumentation.name)) {
    registry.push(instrumentation);
  }
}

/**
 * The externally-injected orchestrion instrumentations, in registration order.
 */
export function getInjectedOrchestrionInstrumentations(): OrchestrionInstrumentation[] {
  return globalThis.__SENTRY_ORCHESTRION__?.registry ?? [];
}
