import { expect, test } from '@playwright/test';
import { waitForError, waitForPlainRequest, waitForTransaction } from '@sentry-internal/test-utils';

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
  let traceId: string | undefined;

  // Every test in this app exports into the same proxy, and the http span only ends once the
  // response is out, so wait for this request's own trace to be complete. Waiting on the span names
  // alone matches a batch that another test filled, whose spans are on a different trace.
  const otelExportPromise = waitForPlainRequest('node-otel-sdk-node-otel', data => {
    const names = getExportedSpans(data)
      .filter(span => span.traceId === traceId)
      .map(span => span.name);
    return names.includes('telemetry-handler') && names.includes('GET');
  });

  const response = await fetch(`${baseURL}/test-telemetry/234`);
  ({ traceId } = (await response.json()) as { traceId: string });

  const exportedSpans = getExportedSpans(await otelExportPromise).filter(span => span.traceId === traceId);

  // The user's own http instrumentation keeps working and stays on the same trace as their spans.
  expect(exportedSpans.map(span => span.name)).toEqual(expect.arrayContaining(['telemetry-handler', 'GET']));
});

test('sends no spans to Sentry', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('node-otel-sdk-node', () => true);
  const errorPromise = waitForError('node-otel-sdk-node', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'This is an exception with id 345';
  });

  await fetch(`${baseURL}/test-telemetry/345`);
  // Proves the request's telemetry reached the proxy, so the absence check below is not vacuous.
  await errorPromise;

  // Absence can only be time bounded. This guards against Sentry's own instrumentation emitting
  // spans again, which would produce a transaction for every request, well inside this window.
  const transaction = await Promise.race([
    transactionPromise,
    new Promise(resolve => setTimeout(() => resolve(undefined), 3000)),
  ]);

  expect(transaction).toBeUndefined();
});

test('leaves outgoing trace propagation to the user propagator', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/test-outgoing`);
  const headers = (await response.json()) as Record<string, string>;

  expect(headers['traceparent']).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-\d{2}$/);
  expect(headers['sentry-trace']).toBeUndefined();
  expect(headers['baggage']).toBeUndefined();
});
