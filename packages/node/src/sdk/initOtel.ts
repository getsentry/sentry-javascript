import moduleModule from 'module';
import { DiagLogLevel, diag } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_SERVICE_NAMESPACE,
} from '@opentelemetry/semantic-conventions';
import { GLOBAL_OBJ, SDK_VERSION, consoleSandbox, logger } from '@sentry/core';
import { SentryPropagator, SentrySampler, SentrySpanProcessor } from '@sentry/opentelemetry';
import { createAddHookMessageChannel } from 'import-in-the-middle';
import { DEBUG_BUILD } from '../debug-build';
import { getOpenTelemetryInstrumentationToPreload } from '../integrations/tracing';
import { SentryContextManager } from '../otel/contextManager';
import { isCjs } from '../utils/commonjs';
import type { NodeClient } from './client';

declare const __IMPORT_META_URL_REPLACEMENT__: string;

// About 277h - this must fit into new Array(len)!
const MAX_MAX_SPAN_WAIT_DURATION = 1_000_000;

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

/** Initialize the ESM loader. */
export function maybeInitializeEsmLoader(): void {
  const [nodeMajor = 0, nodeMinor = 0] = process.versions.node.split('.').map(Number);

  // Register hook was added in v20.6.0 and v18.19.0
  if (nodeMajor >= 22 || (nodeMajor === 20 && nodeMinor >= 6) || (nodeMajor === 18 && nodeMinor >= 19)) {
    // We need to work around using import.meta.url directly because jest complains about it.
    const importMetaUrl =
      typeof __IMPORT_META_URL_REPLACEMENT__ !== 'undefined' ? __IMPORT_META_URL_REPLACEMENT__ : undefined;

    if (!GLOBAL_OBJ._sentryEsmLoaderHookRegistered && importMetaUrl) {
      try {
        const { addHookMessagePort } = createAddHookMessageChannel();
        // @ts-expect-error register is available in these versions
        moduleModule.register('import-in-the-middle/hook.mjs', importMetaUrl, {
          data: { addHookMessagePort, include: [] },
          transferList: [addHookMessagePort],
        });
        GLOBAL_OBJ._sentryEsmLoaderHookRegistered = true;
      } catch (error) {
        logger.warn('Failed to register ESM hook', error);
      }
    }
  } else {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        '[Sentry] You are using Node.js in ESM mode ("import syntax"). The Sentry Node.js SDK is not compatible with ESM in Node.js versions before 18.19.0 or before 20.6.0. Please either build your application with CommonJS ("require() syntax"), or upgrade your Node.js version.',
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
    logger.enable();
    setupOpenTelemetryLogger();
  }

  if (!isCjs()) {
    maybeInitializeEsmLoader();
  }

  // These are all integrations that we need to pre-load to ensure they are set up before any other code runs
  getPreloadMethods(options.integrations).forEach(fn => {
    fn();

    if (debug) {
      logger.log(`[Sentry] Preloaded ${fn.id} instrumentation`);
    }
  });
}

function getPreloadMethods(integrationNames?: string[]): ((() => void) & { id: string })[] {
  const instruments = getOpenTelemetryInstrumentationToPreload();

  if (!integrationNames) {
    return instruments;
  }

  return instruments.filter(instrumentation => integrationNames.includes(instrumentation.id));
}

/** Just exported for tests. */
export function setupOtel(client: NodeClient): BasicTracerProvider {
  // Create and configure NodeTracerProvider
  const provider = new BasicTracerProvider({
    sampler: new SentrySampler(client),
    resource: new Resource({
      [ATTR_SERVICE_NAME]: 'node',
      // eslint-disable-next-line deprecation/deprecation
      [SEMRESATTRS_SERVICE_NAMESPACE]: 'sentry',
      [ATTR_SERVICE_VERSION]: SDK_VERSION,
    }),
    forceFlushTimeoutMillis: 500,
    spanProcessors: [
      new SentrySpanProcessor({
        timeout: _clampSpanProcessorTimeout(client.getOptions().maxSpanWaitDuration),
      }),
    ],
  });

  // Initialize the provider
  provider.register({
    propagator: new SentryPropagator(),
    contextManager: new SentryContextManager(),
  });

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
      logger.warn(`\`maxSpanWaitDuration\` is too high, using the maximum value of ${MAX_MAX_SPAN_WAIT_DURATION}`);
    return MAX_MAX_SPAN_WAIT_DURATION;
  } else if (maxSpanWaitDuration <= 0 || Number.isNaN(maxSpanWaitDuration)) {
    DEBUG_BUILD && logger.warn('`maxSpanWaitDuration` must be a positive number, using default value instead.');
    return undefined;
  }

  return maxSpanWaitDuration;
}

/**
 * Setup the OTEL logger to use our own logger.
 */
function setupOpenTelemetryLogger(): void {
  const otelLogger = new Proxy(logger as typeof logger & { verbose: (typeof logger)['debug'] }, {
    get(target, prop, receiver) {
      const actualProp = prop === 'verbose' ? 'debug' : prop;
      return Reflect.get(target, actualProp, receiver);
    },
  });

  // Disable diag, to ensure this works even if called multiple times
  diag.disable();
  diag.setLogger(otelLogger, DiagLogLevel.DEBUG);
}
