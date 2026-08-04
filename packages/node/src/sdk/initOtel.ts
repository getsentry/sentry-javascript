import type { TracerProvider } from '@opentelemetry/api';
import { propagation, trace } from '@opentelemetry/api';
import { debug as coreDebug, hasSpanStreamingEnabled } from '@sentry/core';
import { setupOpenTelemetryLogger } from '../otel/logger';
import type { NodeClient } from './client';
import {
  applyOtelSpanData,
  backfillStreamedSpanDataFromOtel,
  SentryPropagator,
  SentryTracerProvider,
} from '@sentry/opentelemetry';
import { DEBUG_BUILD } from '../debug-build';
import { getOpenTelemetryInstrumentationToPreload } from '../integrations/tracing';

// The global registry of @opentelemetry/api 1.x, shared across all copies of the package
const OTEL_API_GLOBAL_KEY = Symbol.for('opentelemetry.js.api.1');

/**
 * Registers the given tracer provider as the global tracer provider, recreating the OpenTelemetry
 * API registry when it pre-exists with a different `@opentelemetry/api` version.
 *
 * Some host runtimes (e.g. Neon Functions) pre-create the registry with their own API version.
 * `registerGlobal` requires an exact version match, so every registration through the SDK's copy
 * of `@opentelemetry/api` is rejected and tracing is silently disabled
 * (https://github.com/getsentry/sentry-javascript/issues/22338). This case is identified by a
 * failed registration with an empty `trace` slot: `registerGlobal` checks the slot before the
 * version, so an empty slot means the version gate rejected us and recreating the registry
 * clobbers no other tracer provider. If the slot is occupied (another provider registered first,
 * e.g. a second `Sentry.init()` call), the registry is left untouched and registration fails.
 *
 * Slots Sentry does not claim itself (e.g. `diag`, `metrics`) are carried over into the recreated
 * registry: reads resolve via a semver-compatibility check rather than the exact-match write gate,
 * so they keep working for the copy that registered them. `propagation` and `context` are not
 * carried over because Sentry registers its own right after this.
 */
function registerGlobalTracerProvider(provider: TracerProvider): boolean {
  if (trace.setGlobalTracerProvider(provider)) {
    return true;
  }

  // @opentelemetry/api stores the registry under a `Symbol.for` key that no public type
  // describes, so `typeof globalThis` can only be narrowed to it by casting through `unknown`.
  const otelGlobal = globalThis as unknown as Record<symbol, Record<string, unknown> | undefined>;
  const registry = otelGlobal[OTEL_API_GLOBAL_KEY];
  if (registry && !registry.trace) {
    DEBUG_BUILD &&
      coreDebug.warn(
        'Replaced a pre-existing OpenTelemetry API registry that was created by a different @opentelemetry/api version and would have blocked tracing. If you want to manage OpenTelemetry yourself, set `skipOpenTelemetrySetup: true` in `Sentry.init()`.',
      );
    otelGlobal[OTEL_API_GLOBAL_KEY] = undefined;

    if (!trace.setGlobalTracerProvider(provider)) {
      return false;
    }

    // The cast is needed because TS still has the slot narrowed to `undefined` from the reset
    // above and cannot know the registration call just recreated the registry.
    const recreatedRegistry = otelGlobal[OTEL_API_GLOBAL_KEY] as Record<string, unknown> | undefined;
    if (recreatedRegistry) {
      const { propagation: _propagation, context: _context, ...carriedOverSlots } = registry;
      otelGlobal[OTEL_API_GLOBAL_KEY] = { ...carriedOverSlots, ...recreatedRegistry };
    }

    return true;
  }

  return false;
}

/**
 * Initialize OpenTelemetry for Node.
 */
export function initOpenTelemetry(client: NodeClient): void {
  if (client.getOptions().debug) {
    setupOpenTelemetryLogger();
  }

  const provider = setupOtel(client);
  client.traceProvider = provider;
}

interface NodePreloadOptions {
  debug?: boolean;
  integrations?: string[];
}

/**
 * Preload OpenTelemetry for Node.
 * This can be used to preload instrumentation early, but set up Sentry later.
 * By preloading the OTEL instrumentation wrapping still happens early enough that everything works.
 */
export function preloadOpenTelemetry(options: NodePreloadOptions = {}): void {
  const { debug } = options;

  if (debug) {
    coreDebug.enable();
  }

  // These are all integrations that we need to pre-load to ensure they are set up before any other code runs
  getPreloadMethods(options.integrations).forEach(fn => {
    fn();

    if (debug) {
      coreDebug.log(`[Sentry] Preloaded ${fn.id} instrumentation`);
    }
  });
}

function getPreloadMethods(integrationNames?: string[]): ((() => void) & { id: string })[] {
  const instruments = getOpenTelemetryInstrumentationToPreload();

  if (!integrationNames) {
    return instruments;
  }

  // We match exact matches of instrumentation, but also match prefixes, e.g. "Fastify.v5" will match "Fastify"
  return instruments.filter(instrumentation => {
    const id = instrumentation.id;
    return integrationNames.some(integrationName => id === integrationName || id.startsWith(`${integrationName}.`));
  });
}

/** Just exported for tests. */
export function setupOtel(client: NodeClient): SentryTracerProvider | undefined {
  const provider = new SentryTracerProvider();

  if (!registerGlobalTracerProvider(provider)) {
    DEBUG_BUILD &&
      coreDebug.warn(
        'Could not register SentryTracerProvider because another OpenTelemetry tracer provider is already registered.',
      );
    return undefined;
  }

  propagation.setGlobalPropagator(new SentryPropagator());

  client.on('spanEnd', span => {
    applyOtelSpanData(span, { finalizeStatus: true });
  });

  if (hasSpanStreamingEnabled(client)) {
    client.on('preprocessSpan', backfillStreamedSpanDataFromOtel);
  }

  return provider;
}
