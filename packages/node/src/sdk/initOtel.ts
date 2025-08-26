import { context, propagation, trace } from '@opentelemetry/api';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_SERVICE_NAMESPACE,
} from '@opentelemetry/semantic-conventions';
import { consoleSandbox, debug as coreDebug, GLOBAL_OBJ, SDK_VERSION } from '@sentry/core';
import { type NodeClient, isCjs, SentryContextManager, setupOpenTelemetryLogger } from '@sentry/node-core';
import { SentryPropagator, SentrySampler, SentrySpanProcessor } from '@sentry/opentelemetry';
import { createAddHookMessageChannel } from 'import-in-the-middle';
import moduleModule from 'module';
import { DEBUG_BUILD } from '../debug-build';
import { getOpenTelemetryInstrumentationToPreload } from '../integrations/tracing';

// About 277h - this must fit into new Array(len)!
const MAX_MAX_SPAN_WAIT_DURATION = 1_000_000;

interface AdditionalOpenTelemetryOptions {
  /** Additional SpanProcessor instances that should be used. */
  spanProcessors?: SpanProcessor[];
}

/**
 * Initialize OpenTelemetry for Node.
 */
export function initOpenTelemetry(client: NodeClient, options: AdditionalOpenTelemetryOptions = {}): void {
  if (client.getOptions().debug) {
    setupOpenTelemetryLogger();
  }

  const provider = setupOtel(client, options);
  client.traceProvider = provider;
}

/** Initialize the ESM loader. */
export function maybeInitializeEsmLoader(): void {
  const [nodeMajor = 0, nodeMinor = 0] = process.versions.node.split('.').map(Number);

  // Register hook was added in v20.6.0 and v18.19.0
  if (nodeMajor >= 21 || (nodeMajor === 20 && nodeMinor >= 6) || (nodeMajor === 18 && nodeMinor >= 19)) {
    if (!GLOBAL_OBJ._sentryEsmLoaderHookRegistered) {
      try {
        const { addHookMessagePort } = createAddHookMessageChannel();
        // @ts-expect-error register is available in these versions
        moduleModule.register('import-in-the-middle/hook.mjs', import.meta.url, {
          data: { addHookMessagePort, include: [] },
          transferList: [addHookMessagePort],
        });
      } catch (error) {
        coreDebug.warn('Failed to register ESM hook', error);
      }
    }
  } else {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        `[Sentry] You are using Node.js v${process.versions.node} in ESM mode ("import syntax"). The Sentry Node.js SDK is not compatible with ESM in Node.js versions before 18.19.0 or before 20.6.0. Please either build your application with CommonJS ("require() syntax"), or upgrade your Node.js version.`,
      );
    });
  }
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

  if (!isCjs()) {
    maybeInitializeEsmLoader();
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
export function setupOtel(client: NodeClient, options: AdditionalOpenTelemetryOptions = {}): BasicTracerProvider {
  // Create and configure NodeTracerProvider
  const provider = new BasicTracerProvider({
    sampler: new SentrySampler(client),
    resource: defaultResource().merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'node',
        // eslint-disable-next-line deprecation/deprecation
        [SEMRESATTRS_SERVICE_NAMESPACE]: 'sentry',
        [ATTR_SERVICE_VERSION]: SDK_VERSION,
      }),
    ),
    forceFlushTimeoutMillis: 500,
    spanProcessors: [
      new SentrySpanProcessor({
        timeout: _clampSpanProcessorTimeout(client.getOptions().maxSpanWaitDuration),
      }),
      ...(options.spanProcessors || []),
    ],
  });

  // Register as globals
  trace.setGlobalTracerProvider(provider);
  propagation.setGlobalPropagator(new SentryPropagator());
  context.setGlobalContextManager(new SentryContextManager());

  return provider;
}

/** Just exported for tests. */
export function _clampSpanProcessorTimeout(maxSpanWaitDuration: number | undefined): number | undefined {
  if (maxSpanWaitDuration == null) {
    return undefined;
  }

  // We guard for a max. value here, because we create an array with this length
  // So if this value is too large, this would fail
  if (maxSpanWaitDuration > MAX_MAX_SPAN_WAIT_DURATION) {
    DEBUG_BUILD &&
      coreDebug.warn(`\`maxSpanWaitDuration\` is too high, using the maximum value of ${MAX_MAX_SPAN_WAIT_DURATION}`);
    return MAX_MAX_SPAN_WAIT_DURATION;
  } else if (maxSpanWaitDuration <= 0 || Number.isNaN(maxSpanWaitDuration)) {
    DEBUG_BUILD && coreDebug.warn('`maxSpanWaitDuration` must be a positive number, using default value instead.');
    return undefined;
  }

  return maxSpanWaitDuration;
}
