import type { UndiciInstrumentationConfig } from '@opentelemetry/instrumentation-undici';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import type { IntegrationFn } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, defineIntegration, getClient } from '@sentry/core';
import { generateInstrumentOnce } from '../../otel/instrument';
import type { NodeClient } from '../../sdk/client';
import type { NodeClientOptions } from '../../types';
import type { SentryNodeFetchInstrumentationOptions } from './SentryNodeFetchInstrumentation';
import { SentryNodeFetchInstrumentation } from './SentryNodeFetchInstrumentation';

const INTEGRATION_NAME = 'NodeFetch';

interface NodeFetchOptions {
  /**
   * Whether breadcrumbs should be recorded for requests.
   * Defaults to true
   */
  breadcrumbs?: boolean;

  /**
   * If set to false, do not emit any spans.
   * This will ensure that the default UndiciInstrumentation from OpenTelemetry is not setup,
   * only the Sentry-specific instrumentation for breadcrumbs & trace propagation is applied.
   *
   * If `skipOpenTelemetrySetup: true` is configured, this defaults to `false`, otherwise it defaults to `true`.
   */
  spans?: boolean;

  /**
   * Do not capture spans or breadcrumbs for outgoing fetch requests to URLs where the given callback returns `true`.
   * This controls both span & breadcrumb creation - spans will be non recording if tracing is disabled.
   */
  ignoreOutgoingRequests?: (url: string) => boolean;
}

const instrumentOtelNodeFetch = generateInstrumentOnce<UndiciInstrumentationConfig>(INTEGRATION_NAME, config => {
  return new UndiciInstrumentation(config);
});

const instrumentSentryNodeFetch = generateInstrumentOnce<SentryNodeFetchInstrumentationOptions>(
  `${INTEGRATION_NAME}.sentry`,
  config => {
    return new SentryNodeFetchInstrumentation(config);
  },
);

const _nativeNodeFetchIntegration = ((options: NodeFetchOptions = {}) => {
  return {
    name: 'NodeFetch',
    setupOnce() {
      const instrumentSpans = _shouldInstrumentSpans(options, getClient<NodeClient>()?.getOptions());

      // This is the "regular" OTEL instrumentation that emits spans
      if (instrumentSpans) {
        const instrumentationConfig = getConfigWithDefaults(options);
        instrumentOtelNodeFetch(instrumentationConfig);
      }

      // This is the Sentry-specific instrumentation that creates breadcrumbs & propagates traces
      // This must be registered after the OTEL one, to ensure that the core trace propagation logic takes presedence
      // Otherwise, the sentry-trace header may be set multiple times
      instrumentSentryNodeFetch(options);
    },
  };
}) satisfies IntegrationFn;

export const nativeNodeFetchIntegration = defineIntegration(_nativeNodeFetchIntegration);

// Matching the behavior of the base instrumentation
function getAbsoluteUrl(origin: string, path: string = '/'): string {
  const url = `${origin}`;

  if (url.endsWith('/') && path.startsWith('/')) {
    return `${url}${path.slice(1)}`;
  }

  if (!url.endsWith('/') && !path.startsWith('/')) {
    return `${url}/${path.slice(1)}`;
  }

  return `${url}${path}`;
}

function _shouldInstrumentSpans(options: NodeFetchOptions, clientOptions: Partial<NodeClientOptions> = {}): boolean {
  // If `spans` is passed in, it takes precedence
  // Else, we by default emit spans, unless `skipOpenTelemetrySetup` is set to `true`
  return typeof options.spans === 'boolean' ? options.spans : !clientOptions.skipOpenTelemetrySetup;
}

function getConfigWithDefaults(options: Partial<NodeFetchOptions> = {}): UndiciInstrumentationConfig {
  const instrumentationConfig = {
    requireParentforSpans: false,
    ignoreRequestHook: request => {
      const url = getAbsoluteUrl(request.origin, request.path);
      const _ignoreOutgoingRequests = options.ignoreOutgoingRequests;
      const shouldIgnore = _ignoreOutgoingRequests && url && _ignoreOutgoingRequests(url);

      return !!shouldIgnore;
    },
    startSpanHook: () => {
      return {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.node_fetch',
      };
    },
  } satisfies UndiciInstrumentationConfig;

  return instrumentationConfig;
}
