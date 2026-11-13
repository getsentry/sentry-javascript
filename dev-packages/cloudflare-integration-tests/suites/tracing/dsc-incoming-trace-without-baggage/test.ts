import type { DynamicSamplingContext } from '@sentry/core';
import { parseBaggageHeader } from '@sentry/core';
import { createTestServer } from '@sentry-internal/test-utils';
import { describe, expect, it, onTestFinished } from 'vitest';
import { createRunner } from '../../../runner';

const TRACE_ID = '12345678901234567890123456789012';
const PARENT_SPAN_ID = '1234567890123456';

const CLIENT_DSC = {
  trace_id: TRACE_ID,
  public_key: 'public',
  environment: 'production',
  release: '1.0.0',
};

const CASES: { name: string; path: string; headers: Record<string, string>; expectedDsc: Record<string, unknown> }[] = [
  {
    name: 'an inherited positive decision',
    path: '/',
    headers: { 'sentry-trace': `${TRACE_ID}-${PARENT_SPAN_ID}-1` },
    expectedDsc: { sampled: 'true', sample_rate: '1', transaction: 'GET /' },
  },
  {
    name: 'an inherited positive decision with only third-party baggage',
    path: '/',
    headers: { 'sentry-trace': `${TRACE_ID}-${PARENT_SPAN_ID}-1`, baggage: 'foo=bar' },
    expectedDsc: { sampled: 'true', sample_rate: '1', transaction: 'GET /' },
  },
  {
    name: 'an inherited negative decision',
    path: '/error',
    headers: { 'sentry-trace': `${TRACE_ID}-${PARENT_SPAN_ID}-0` },
    expectedDsc: { sampled: 'false', sample_rate: '0' },
  },
  {
    name: 'a deferred decision',
    path: '/error',
    headers: { 'sentry-trace': `${TRACE_ID}-${PARENT_SPAN_ID}` },
    expectedDsc: { sampled: expect.stringMatching(/^(true|false)$/), sample_rate: '0.5' },
  },
];

function toSentryBaggage(dsc: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(dsc).map(([key, value]) => [`sentry-${key}`, value]));
}

describe.for(['stream', 'static'] as const)('traceLifecycle: %s', traceLifecycle => {
  it.for(CASES)(
    'creates the DSC from the segment span for $name',
    async ({ path, headers, expectedDsc }, { signal }) => {
      let outgoingHeaders: Record<string, string | string[] | undefined> = {};
      const [serverUrl, closeTestServer] = await createTestServer()
        .get('/outgoing', requestHeaders => {
          outgoingHeaders = requestHeaders;
        })
        .start();
      onTestFinished(closeTestServer);

      const isError = path === '/error';
      const expectedItemType = isError ? 'event' : traceLifecycle === 'static' ? 'transaction' : 'span';
      let trace: DynamicSamplingContext | undefined;

      const runner = createRunner(__dirname)
        .withServerUrl(serverUrl)
        .withWranglerArgs(...(traceLifecycle === 'static' ? ['--var', 'SENTRY_TRACE_LIFECYCLE:static'] : []))
        .start(signal);
      await runner.makeRequestAndWaitForEnvelope(
        'get',
        path,
        envelope => {
          expect(envelope[1][0][0].type).toBe(expectedItemType);
          trace = envelope[0].trace as DynamicSamplingContext;
        },
        { headers, expectError: isError },
      );

      expect(trace).toEqual({
        ...CLIENT_DSC,
        sample_rand: expect.stringMatching(/^0\.\d+$/),
        ...expectedDsc,
      });
      expect(Number(trace?.sample_rand) < Number(trace?.sample_rate)).toBe(trace?.sampled === 'true');
      expect(outgoingHeaders['sentry-trace']).toMatch(
        new RegExp(`^${TRACE_ID}-[\\da-f]{16}-${trace?.sampled === 'true' ? 1 : 0}$`),
      );
      expect(parseBaggageHeader(outgoingHeaders.baggage)).toEqual(toSentryBaggage(trace ?? {}));
    },
  );
});
