import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import type { SerializedStreamedSpan } from '@sentry/core';
import { getSpanOp, getSpansFromEnvelope } from '../../../spanUtils';

type EchoedHeaders = {
  sentryTrace: string | null;
  baggage: string | null;
  authorization: string | null;
  xFromInit: string | null;
  xExtra: string | null;
  xMergeProbe: string | null;
};

const SENTRY_TRACE_HEADER_RE = /^[0-9a-f]{32}-[0-9a-f]{16}-[01]$/;

function startStubFetchScenario(signal: AbortSignal) {
  let mainSpan: SerializedStreamedSpan | undefined;
  let doSpan: SerializedStreamedSpan | undefined;

  // The worker and the Durable Object stream their spans from separate isolates, so each one
  // arrives in its own envelope.
  const { makeRequest, completed } = createRunner(__dirname)
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.parent_span_id).toBeUndefined();
      mainSpan = segmentSpan;
    })
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.parent_span_id).toBeDefined();
      doSpan = segmentSpan;
    })
    .unordered()
    .start(signal);

  return {
    makeRequest,
    async completedWithTraceCheck(): Promise<void> {
      await completed();

      // Both routes are raw URLs, so the streamed segment name keeps the method only.
      expect(mainSpan?.name).toBe('GET');
      expect(doSpan?.name).toBe('GET');
      expect(mainSpan?.attributes['sentry.origin']?.value).toBe('auto.http.cloudflare');
      expect(doSpan?.attributes['sentry.origin']?.value).toBe('auto.http.cloudflare');
      expect(doSpan?.trace_id).toBe(mainSpan?.trace_id);
      expect(doSpan?.parent_span_id).toBe(mainSpan?.span_id);
    },
  };
}

it('stub.fetch: headers in init (URL string + init)', async ({ signal }) => {
  const { makeRequest, completedWithTraceCheck } = startStubFetchScenario(signal);
  const body = await makeRequest<EchoedHeaders>('get', '/via-init');
  await completedWithTraceCheck();

  expect(body?.sentryTrace).toEqual(expect.stringMatching(SENTRY_TRACE_HEADER_RE));
  expect(body?.baggage).toContain('sentry-environment=production,sentry-public_key=public,sentry-trace_id=');
  expect(body?.authorization).toBe('Bearer from-init');
  expect(body?.xExtra).toBe('init-extra');
  expect(body?.xMergeProbe).toBe('via-init-probe');
  expect(body?.xFromInit).toBeNull();
});

it('stub.fetch: headers on Request (URL from incoming request)', async ({ signal }) => {
  const { makeRequest, completedWithTraceCheck } = startStubFetchScenario(signal);
  const body = await makeRequest<EchoedHeaders>('get', '/via-request');
  await completedWithTraceCheck();

  expect(body?.sentryTrace).toEqual(expect.stringMatching(SENTRY_TRACE_HEADER_RE));
  expect(body?.baggage).toContain('sentry-environment=production,sentry-public_key=public,sentry-trace_id=');
  expect(body?.authorization).toBe('Bearer from-request');
  expect(body?.xExtra).toBe('request-extra');
  expect(body?.xMergeProbe).toBe('via-request-probe');
  expect(body?.xFromInit).toBeNull();
});

it('stub.fetch: Request + init — only init headers are sent', async ({ signal }) => {
  const { makeRequest, completedWithTraceCheck } = startStubFetchScenario(signal);
  const body = await makeRequest<EchoedHeaders>('get', '/via-request-and-init');
  await completedWithTraceCheck();

  expect(body?.sentryTrace).toEqual(expect.stringMatching(SENTRY_TRACE_HEADER_RE));
  expect(body?.baggage).toContain('sentry-environment=production,sentry-public_key=public,sentry-trace_id=');
  expect(body?.authorization).toBeNull();
  expect(body?.xExtra).toBeNull();
  expect(body?.xMergeProbe).toBe('via-init-wins');
  expect(body?.xFromInit).toBe('1');
});

it('stub.fetch: does not append SDK baggage when the Request already includes Sentry baggage', async ({ signal }) => {
  const { makeRequest, completedWithTraceCheck } = startStubFetchScenario(signal);
  const body = await makeRequest<EchoedHeaders>('get', '/with-preset-sentry-baggage');
  await completedWithTraceCheck();

  expect(body?.sentryTrace).toEqual(expect.stringMatching(SENTRY_TRACE_HEADER_RE));
  // Dynamic SDK baggage includes `sentry-trace_id=…`; appending it again would change this string.
  expect(body?.baggage).toBe('sentry-environment=preset,acme=vendor');
});
