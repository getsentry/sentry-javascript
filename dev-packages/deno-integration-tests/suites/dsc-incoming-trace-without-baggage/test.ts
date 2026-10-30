// <reference lib="deno.ns" />

import type {
  DynamicSamplingContext,
  Envelope,
  Event,
  SerializedStreamedSpanContainer,
  TransactionEvent,
} from '@sentry/core';
import type { DenoOptions } from '@sentry/deno';
import * as Sentry from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { assertMatch } from 'https://deno.land/std@0.212.0/assert/assert_match.ts';
import { envelopeSink, getSpanOp, resetGlobals, withTimeout } from '../../src/index.ts';

const TRACE_ID = '12312012123120121231201212312012';
const PARENT_SPAN_ID = '1121201211212012';
const ERROR_MESSAGE = 'dsc-incoming-trace-without-baggage';

type TraceLifecycle = 'stream' | 'static';

interface ScenarioResult {
  outgoingHeaders: Headers;
  errorEnvelope: Envelope;
  segmentEnvelope: Envelope | undefined;
}

function isHandlerSpanEnvelope(envelope: Envelope): boolean {
  return envelope[1].some(
    ([header, payload]) =>
      header.type === 'span' &&
      (payload as SerializedStreamedSpanContainer).items.some(
        span =>
          span.is_segment && getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === '/handler',
      ),
  );
}

function isHandlerTransactionEnvelope(envelope: Envelope): boolean {
  return envelope[1].some(
    ([header, payload]) =>
      header.type === 'transaction' &&
      (payload as TransactionEvent).contexts?.trace?.op === 'http.server' &&
      (payload as TransactionEvent).transaction === 'GET /handler',
  );
}

function isHandlerErrorEnvelope(envelope: Envelope): boolean {
  return envelope[1].some(
    ([header, payload]) =>
      header.type === 'event' && (payload as Event).exception?.values?.[0]?.value === ERROR_MESSAGE,
  );
}

async function runScenario(
  traceLifecycle: TraceLifecycle,
  options: Pick<DenoOptions, 'tracesSampleRate' | 'tracesSampler'>,
  requestHeaders: Record<string, string>,
): Promise<ScenarioResult> {
  resetGlobals();
  const sink = envelopeSink();

  Sentry.init({
    dsn: 'https://public@o123.ingest.sentry.io/456',
    environment: 'dsc-test',
    release: '1.0.0',
    tracePropagationTargets: [/\/echo$/],
    // The echo server continues the same trace in-process, so its segment would share the span envelope.
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'DenoServe'),
      Sentry.denoServeIntegration({ ignoreIncomingRequests: urlPath => urlPath === '/echo' }),
    ],
    transport: sink.transport,
    ...(traceLifecycle === 'static' && { traceLifecycle }),
    ...options,
  });

  const abortController = new AbortController();

  let onEchoListen: ((_: unknown) => void) | undefined;
  const echoListening = new Promise(resolve => (onEchoListen = resolve));
  let resolveOutgoingHeaders: ((headers: Headers) => void) | undefined;
  const outgoingHeaders = new Promise<Headers>(resolve => (resolveOutgoingHeaders = resolve));
  const echoServer = Deno.serve({ port: 0, signal: abortController.signal, onListen: onEchoListen }, request => {
    resolveOutgoingHeaders?.(new Headers(request.headers));
    return new Response('echo');
  });
  await echoListening;

  let onListen: ((_: unknown) => void) | undefined;
  const listening = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, async () => {
    const echoResponse = await fetch(`http://localhost:${echoServer.addr.port}/echo`);
    await echoResponse.text();
    Sentry.captureException(new Error(ERROR_MESSAGE));
    return new Response('OK');
  });
  await listening;

  try {
    const errorEnvelopePromise = withTimeout(sink.waitFor(isHandlerErrorEnvelope), 5_000, 'error envelope');

    const response = await fetch(`http://localhost:${server.addr.port}/handler`, { headers: requestHeaders });
    assertEquals(await response.text(), 'OK');

    await Sentry.flush();

    return {
      outgoingHeaders: await withTimeout(outgoingHeaders, 5_000, 'outgoing request to echo server'),
      errorEnvelope: await errorEnvelopePromise,
      segmentEnvelope: sink.envelopes.find(
        traceLifecycle === 'static' ? isHandlerTransactionEnvelope : isHandlerSpanEnvelope,
      ),
    };
  } finally {
    abortController.abort();
    await Promise.all([server.finished, echoServer.finished]);
  }
}

function baggageToDsc(baggage: string | null): Record<string, string> {
  assertExists(baggage);
  return Object.fromEntries(
    baggage.split(',').map(entry => {
      const [key, value] = entry.trim().split('=');
      assert(key?.startsWith('sentry-'), `unexpected non-sentry baggage entry: ${entry}`);
      return [key.slice('sentry-'.length), decodeURIComponent(value ?? '')];
    }),
  );
}

function assertDscForIncomingTraceWithoutBaggage(
  { outgoingHeaders, errorEnvelope, segmentEnvelope }: ScenarioResult,
  expectedSampleRate: string,
): void {
  const outgoingDsc = baggageToDsc(outgoingHeaders.get('baggage'));
  const sampled = outgoingDsc.sampled;
  assert(sampled === 'true' || sampled === 'false', `unexpected sampled value: ${sampled}`);

  const sampleRand = Number(outgoingDsc.sample_rand);
  assert(sampleRand >= 0 && sampleRand < 1, `sample_rand out of range: ${outgoingDsc.sample_rand}`);
  assertEquals(sampleRand < Number(expectedSampleRate), sampled === 'true');

  const expectedDsc: Partial<DynamicSamplingContext> = {
    environment: 'dsc-test',
    release: '1.0.0',
    public_key: 'public',
    trace_id: TRACE_ID,
    org_id: '123',
    sampled,
    sample_rand: outgoingDsc.sample_rand,
    sample_rate: expectedSampleRate,
  };

  assertMatch(
    outgoingHeaders.get('sentry-trace') ?? '',
    new RegExp(`^${TRACE_ID}-[0-9a-f]{16}-${sampled === 'true' ? 1 : 0}$`),
  );
  assertEquals(outgoingDsc, expectedDsc);
  assertEquals(errorEnvelope[0].trace, expectedDsc);

  if (sampled === 'true') {
    assertExists(segmentEnvelope, 'envelope for the sampled /handler segment');
    assertEquals(segmentEnvelope[0].trace, expectedDsc);
  } else {
    assertEquals(segmentEnvelope, undefined);
  }
}

const cases: {
  name: string;
  options: Pick<DenoOptions, 'tracesSampleRate' | 'tracesSampler'>;
  requestHeaders: Record<string, string>;
  expectedSampled?: 'true' | 'false';
  expectedSampleRate: string;
}[] = [
  {
    name: 'incoming sampled trace without baggage creates the DSC from the segment span',
    options: { tracesSampleRate: 0.5 },
    requestHeaders: { 'sentry-trace': `${TRACE_ID}-${PARENT_SPAN_ID}-1` },
    expectedSampled: 'true',
    expectedSampleRate: '1',
  },
  {
    name: 'incoming sampled trace with only third-party baggage creates the DSC from the segment span',
    options: { tracesSampleRate: 0.5 },
    requestHeaders: { 'sentry-trace': `${TRACE_ID}-${PARENT_SPAN_ID}-1`, baggage: 'foo=bar' },
    expectedSampled: 'true',
    expectedSampleRate: '1',
  },
  {
    name: 'incoming unsampled trace without baggage creates the DSC from the segment span',
    options: { tracesSampleRate: 0.5 },
    requestHeaders: { 'sentry-trace': `${TRACE_ID}-${PARENT_SPAN_ID}-0` },
    expectedSampled: 'false',
    expectedSampleRate: '0',
  },
  {
    name: 'incoming deferred trace without baggage applies the local tracesSampleRate to the DSC',
    options: { tracesSampleRate: 0.5 },
    requestHeaders: { 'sentry-trace': `${TRACE_ID}-${PARENT_SPAN_ID}` },
    expectedSampleRate: '0.5',
  },
  {
    name: 'incoming deferred trace without baggage applies the tracesSampler rate to the DSC',
    options: { tracesSampler: () => 0.25 },
    requestHeaders: { 'sentry-trace': `${TRACE_ID}-${PARENT_SPAN_ID}` },
    expectedSampleRate: '0.25',
  },
];

for (const traceLifecycle of ['stream', 'static'] as const) {
  for (const { name, options, requestHeaders, expectedSampled, expectedSampleRate } of cases) {
    Deno.test(`[${traceLifecycle}] ${name}`, async () => {
      const result = await runScenario(traceLifecycle, options, requestHeaders);

      if (expectedSampled) {
        assertEquals(baggageToDsc(result.outgoingHeaders.get('baggage')).sampled, expectedSampled);
      }
      assertDscForIncomingTraceWithoutBaggage(result, expectedSampleRate);
    });
  }
}
