import { expect, it } from 'vitest';
import type { Event } from '@sentry/core';
import { createRunner } from '../../../runner';

type EchoedHeaders = {
  sentryTrace: string | null;
  baggage: string | null;
  authorization: string | null;
  xFromInit: string | null;
  xExtra: string | null;
  xMergeProbe: string | null;
};

const SENTRY_TRACE_HEADER_RE = /^[0-9a-f]{32}-[0-9a-f]{16}-[01]$/;

type ScenarioPath = '/via-init' | '/via-request' | '/via-request-and-init' | '/with-preset-sentry-baggage';

function startStubFetchScenario(path: ScenarioPath, signal: AbortSignal) {
  let mainTraceId: string | undefined;
  let mainSpanId: string | undefined;
  let doTraceId: string | undefined;
  let doParentSpanId: string | undefined;

  const traceBase = {
    op: 'http.server',
    data: expect.objectContaining({
      'sentry.origin': 'auto.http.cloudflare',
    }),
    origin: 'auto.http.cloudflare',
  };

  const { makeRequest, completed } = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;
      const parentSpanId = transactionEvent.contexts?.trace?.parent_span_id;

      expect(transactionEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining(traceBase),
          }),
          transaction: `GET ${path}`,
        }),
      );
      expect(parentSpanId).toBeUndefined();

      mainTraceId = transactionEvent.contexts?.trace?.trace_id as string;
      mainSpanId = transactionEvent.contexts?.trace?.span_id as string;
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;
      const parentSpanId = transactionEvent.contexts?.trace?.parent_span_id;

      expect(transactionEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining(traceBase),
          }),
          transaction: `GET ${path}`,
        }),
      );
      expect(parentSpanId).toBeDefined();

      doTraceId = transactionEvent.contexts?.trace?.trace_id as string;
      doParentSpanId = parentSpanId as string;
    })
    .unordered()
    .start(signal);

  return {
    makeRequest,
    async completedWithTraceCheck(): Promise<void> {
      await completed();
      expect(mainTraceId).toBeDefined();
      expect(doTraceId).toBeDefined();
      expect(mainTraceId).toBe(doTraceId);
      expect(mainSpanId).toBeDefined();
      expect(doParentSpanId).toBeDefined();
      expect(doParentSpanId).toBe(mainSpanId);
    },
  };
}

it('stub.fetch: headers in init (URL string + init)', async ({ signal }) => {
  const { makeRequest, completedWithTraceCheck } = startStubFetchScenario('/via-init', signal);
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
  const { makeRequest, completedWithTraceCheck } = startStubFetchScenario('/via-request', signal);
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
  const { makeRequest, completedWithTraceCheck } = startStubFetchScenario('/via-request-and-init', signal);
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
  const { makeRequest, completedWithTraceCheck } = startStubFetchScenario('/with-preset-sentry-baggage', signal);
  const body = await makeRequest<EchoedHeaders>('get', '/with-preset-sentry-baggage');
  await completedWithTraceCheck();

  expect(body?.sentryTrace).toEqual(expect.stringMatching(SENTRY_TRACE_HEADER_RE));
  // Dynamic SDK baggage includes `sentry-trace_id=…`; appending it again would change this string.
  expect(body?.baggage).toBe('sentry-environment=preset,acme=vendor');
});
