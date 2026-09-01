import { expect, test } from '@playwright/test';
import { waitForPlainRequest } from '@sentry-internal/test-utils';

interface OtlpSpan {
  name: string;
  traceId: string;
}

/**
 * The proxy hands back the payloads it received as newline separated JSON, so a single read can
 * hold more than one OTLP export.
 */
function getExportedSpans(data: string): OtlpSpan[] {
  return data
    .split('\n')
    .filter(Boolean)
    .flatMap(
      line => (JSON.parse(line) as { resourceSpans?: { scopeSpans?: { spans?: OtlpSpan[] }[] }[] }).resourceSpans ?? [],
    )
    .flatMap(resourceSpan => resourceSpan.scopeSpans ?? [])
    .flatMap(scopeSpan => scopeSpan.spans ?? []);
}

test('exports the spans of the user OpenTelemetry setup to their own collector', async ({ baseURL }) => {
  // The user's http span only ends once the response is out, so wait until both it and the span
  // started inside the handler have been exported.
  const otelExportPromise = waitForPlainRequest('node-otel-sdk-node-otel', data => {
    const spans = getExportedSpans(data);
    const otelSpan = spans.find(span => span.name === 'otel-span');
    return !!otelSpan && spans.some(span => span.name === 'GET' && span.traceId === otelSpan.traceId);
  });

  await fetch(`${baseURL}/test-transaction`);

  const exportedSpans = getExportedSpans(await otelExportPromise);

  const otelSpan = exportedSpans.find(span => span.name === 'otel-span');
  expect(otelSpan).toBeDefined();

  // The user's own http instrumentation keeps working and stays on the same trace as their spans.
  expect(exportedSpans).toContainEqual(expect.objectContaining({ name: 'GET', traceId: otelSpan?.traceId }));

  // Sentry does not feed its spans into the user's pipeline.
  expect(exportedSpans.map(span => span.name)).not.toContain('sentry-span');
});

test('propagates both the Sentry and the OpenTelemetry trace on outgoing requests', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/test-outgoing`);
  const headers = (await response.json()) as Record<string, string>;

  expect(headers['sentry-trace']).toMatch(/^[a-f0-9]{32}-[a-f0-9]{16}-[01]$/);
  expect(headers['baggage']).toContain('sentry-trace_id=');
  expect(headers['traceparent']).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-\d{2}$/);
});
