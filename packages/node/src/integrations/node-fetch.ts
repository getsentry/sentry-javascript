import type { UndiciInstrumentationConfig } from '@opentelemetry/instrumentation-undici';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import type { IntegrationFn } from '@sentry/core';
import {
  defineIntegration,
  getClient,
  hasSpansEnabled,
  SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_URL_FULL,
  stripDataUrlContent,
} from '@sentry/core';
import type { NodeClient } from '@sentry/node-core';
import { generateInstrumentOnce, SentryNodeFetchInstrumentation } from '@sentry/node-core';
import type { NodeClientOptions } from '../types';

const INTEGRATION_NAME = 'NodeFetch';

interface NodeFetchOptions extends Pick<UndiciInstrumentationConfig, 'requestHook' | 'responseHook'> {
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

const instrumentOtelNodeFetch = generateInstrumentOnce(
  INTEGRATION_NAME,
  UndiciInstrumentation,
  (options: NodeFetchOptions) => {
    return getConfigWithDefaults(options);
  },
);

const instrumentSentryNodeFetch = generateInstrumentOnce(
  `${INTEGRATION_NAME}.sentry`,
  SentryNodeFetchInstrumentation,
  (options: NodeFetchOptions) => {
    return options;
  },
);

const _nativeNodeFetchIntegration = ((options: NodeFetchOptions = {}) => {
  return {
    name: 'NodeFetch',
    setupOnce() {
      const instrumentSpans = _shouldInstrumentSpans(options, getClient<NodeClient>()?.getOptions());

      // This is the "regular" OTEL instrumentation that emits spans
      if (instrumentSpans) {
        instrumentOtelNodeFetch(options);
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
  // Else, we by default emit spans, unless `skipOpenTelemetrySetup` is set to `true` or spans are not enabled
  return typeof options.spans === 'boolean'
    ? options.spans
    : !clientOptions.skipOpenTelemetrySetup && hasSpansEnabled(clientOptions);
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
    startSpanHook: request => {
      const url = getAbsoluteUrl(request.origin, request.path);

      // Sanitize data URLs to prevent long base64 strings in span attributes
      if (url.startsWith('data:')) {
        const sanitizedUrl = stripDataUrlContent(url);
        return {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.node_fetch',
          'http.url': sanitizedUrl,
          [SEMANTIC_ATTRIBUTE_URL_FULL]: sanitizedUrl,
          [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: `${request.method || 'GET'} ${sanitizedUrl}`,
        };
      }

      return {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.node_fetch',
      };
    },
    requestHook: options.requestHook,
    responseHook: options.responseHook,
  } satisfies UndiciInstrumentationConfig;

  return instrumentationConfig;
}
