import moduleModule from 'module';
import { DiagLogLevel, diag } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_NAMESPACE,
  SEMRESATTRS_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { SDK_VERSION } from '@sentry/core';
import { SentryPropagator, SentrySampler, SentrySpanProcessor } from '@sentry/opentelemetry';
import { GLOBAL_OBJ, consoleSandbox, logger } from '@sentry/utils';

import { getOpenTelemetryInstrumentationToPreload } from '../integrations/tracing';
import { SentryContextManager } from '../otel/contextManager';
import { isCjs } from '../utils/commonjs';
import type { NodeClient } from './client';

declare const __IMPORT_META_URL_REPLACEMENT__: string;

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
        // @ts-expect-error register is available in these versions
        moduleModule.register('@opentelemetry/instrumentation/hook.mjs', importMetaUrl);
        GLOBAL_OBJ._sentryEsmLoaderHookRegistered = true;
      } catch (error) {
        logger.warn('Failed to register ESM hook', error);
      }
    }
  } else {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        '[Sentry] You are using Node.js in ESM mode ("import syntax"). The Sentry Node.js SDK is not compatible with ESM in Node.js versions before 18.19.0 or before 20.6.0. Please either build your application with CommonJS ("require() syntax"), or use version 7.x of the Sentry Node.js SDK.',
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
      [SEMRESATTRS_SERVICE_NAME]: 'node',
      [SEMRESATTRS_SERVICE_NAMESPACE]: 'sentry',
      [SEMRESATTRS_SERVICE_VERSION]: SDK_VERSION,
    }),
    forceFlushTimeoutMillis: 500,
  });
  provider.addSpanProcessor(new SentrySpanProcessor());

  // Initialize the provider
  provider.register({
    propagator: new SentryPropagator(),
    contextManager: new SentryContextManager(),
  });

  return provider;
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
