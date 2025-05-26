import { context, diag, DiagLogLevel, propagation, trace } from '@opentelemetry/api';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_SERVICE_NAMESPACE,
} from '@opentelemetry/semantic-conventions';
import { consoleSandbox, GLOBAL_OBJ, logger, SDK_VERSION } from '@sentry/core';
import { SentryPropagator, SentrySampler, SentrySpanProcessor } from '@sentry/opentelemetry';
import { createAddHookMessageChannel } from 'import-in-the-middle';
import moduleModule from 'module';
import { DEBUG_BUILD } from '../debug-build';
import { SentryContextManager } from '../otel/contextManager';
import { getResourceFromAttributes } from '../otel/resources';
import type { NodeClient } from './client';

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
        logger.warn('Failed to register ESM hook', error);
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

/** Just exported for tests. */
export function setupOtel(client: NodeClient, options: AdditionalOpenTelemetryOptions = {}): BasicTracerProvider {
  // Create and configure NodeTracerProvider
  const provider = new BasicTracerProvider({
    sampler: new SentrySampler(client),
    resource: getResourceFromAttributes({
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
