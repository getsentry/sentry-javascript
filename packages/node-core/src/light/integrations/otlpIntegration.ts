import { trace } from '@opentelemetry/api';
import type { Client, IntegrationFn } from '@sentry/core';
import {
  debug,
  defineIntegration,
  dsnFromString,
  registerExternalPropagationContext,
  SENTRY_API_VERSION,
} from '@sentry/core';

const INTEGRATION_NAME = 'OtlpIntegration';

const _otlpIntegration = (() => {
  return {
    name: INTEGRATION_NAME,

    setup(_client: Client): void {
      // Always register external propagation context so that Sentry error/log events
      // are linked to the active OTel trace context.
      registerExternalPropagationContext(() => {
        const activeSpan = trace.getActiveSpan();
        if (!activeSpan) {
          return undefined;
        }
        const spanContext = activeSpan.spanContext();
        return { traceId: spanContext.traceId, spanId: spanContext.spanId };
      });

      debug.log(`[${INTEGRATION_NAME}] External propagation context registered.`);
    },
  };
}) satisfies IntegrationFn;

/**
 * OTLP integration for the Sentry light SDK.
 *
 * Bridges an existing OpenTelemetry setup with Sentry by linking Sentry
 * error/log events to the active OTel trace context.
 */
export const otlpIntegration = defineIntegration(_otlpIntegration);

/**
 * Returns the OTLP traces endpoint URL and auth headers for a given Sentry DSN.
 * Use this to configure your own `OTLPTraceExporter`.
 */
export function getOtlpTracesEndpoint(dsn: string): { url: string; headers: Record<string, string> } | undefined {
  const parsed = dsnFromString(dsn);
  if (!parsed) {
    return undefined;
  }

  const { protocol, host, port, path, projectId, publicKey } = parsed;
  const basePath = path ? `/${path}` : '';
  const portStr = port ? `:${port}` : '';

  return {
    url: `${protocol}://${host}${portStr}${basePath}/api/${projectId}/integration/otlp/v1/traces/`,
    headers: {
      'X-Sentry-Auth': `Sentry sentry_version=${SENTRY_API_VERSION}, sentry_key=${publicKey}`,
    },
  };
}
