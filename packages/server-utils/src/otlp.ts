import { isSpanContextValid, trace } from '@opentelemetry/api';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, dsnFromString, SENTRY_API_VERSION, registerExternalPropagationContext } from '@sentry/core';

const INTEGRATION_NAME = 'Otlp' as const;

const _otlpIntegration = (() => {
  return {
    name: INTEGRATION_NAME,

    setup(): void {
      registerExternalPropagationContext(() => {
        const activeSpan = trace.getActiveSpan();
        if (!activeSpan) {
          return undefined;
        }

        // OpenTelemetry hands out a span wrapping `INVALID_SPAN_CONTEXT` when tracing is suppressed,
        // or when a span is started before a tracer provider is registered. Its ids are all zeroes,
        // so fall back to the Sentry scope rather than stamping that onto everything we send.
        const spanContext = activeSpan.spanContext();
        if (!isSpanContextValid(spanContext)) {
          return undefined;
        }

        const { traceId, spanId } = spanContext;
        return { traceId, spanId };
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Connects Sentry to an existing OpenTelemetry setup.
 *
 * Everything Sentry sends that carries trace information (errors, logs, metrics and check-ins) is
 * attached to the OpenTelemetry span that is active when it happens, so it shows up on the same
 * trace as the spans your OpenTelemetry SDK exports. Outgoing request propagation is left to your
 * OpenTelemetry propagator.
 *
 * An active Sentry span still takes precedence, so this only changes what happens when Sentry has no
 * span of its own, which is the usual setup when OpenTelemetry owns tracing.
 *
 * This does not export any spans. Configure your own span exporter and point it at Sentry using
 * {@link getOtlpTracesEndpoint}.
 */
export const otlpIntegration = defineIntegration(_otlpIntegration);

/**
 * Builds the URL and auth headers for Sentry's OTLP traces endpoint, to configure an
 * `OTLPTraceExporter` with.
 *
 * Returns `undefined` if the DSN cannot be parsed.
 */
export function getOtlpTracesEndpoint(dsn: string): { url: string; headers: Record<string, string> } | undefined {
  const parsedDsn = dsnFromString(dsn);
  if (!parsedDsn) {
    return undefined;
  }

  const { protocol, host, port, path, projectId, publicKey } = parsedDsn;
  const basePath = path ? `/${path}` : '';
  const portSuffix = port ? `:${port}` : '';

  return {
    url: `${protocol}://${host}${portSuffix}${basePath}/api/${projectId}/integration/otlp/v1/traces/`,
    headers: {
      'X-Sentry-Auth': `Sentry sentry_version=${SENTRY_API_VERSION}, sentry_key=${publicKey}`,
    },
  };
}
