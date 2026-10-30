import { parseBaggageHeader, SDK_VERSION } from '@sentry/core';
import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../node-integration-tests/utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

const TRACE_ID = '12312012123120121231201212312012';
const PARENT_SPAN_ID = '1121201211212012';

type Dsc = { sample_rate: string; sampled: string; transaction?: string };

type Case = {
  sentryTrace: string;
  baggage?: string;
  path: string;
  tracesSampleRate: string;
  sampled: boolean;
  dsc: Dsc;
};

type Lifecycle = 'stream' | 'static';

async function runCase(
  lifecycle: Lifecycle,
  { sentryTrace, baggage, path, tracesSampleRate, sampled, dsc }: Case,
): Promise<void> {
  const trace = {
    trace_id: TRACE_ID,
    public_key: 'public',
    environment: 'production',
    release: '1.0',
    sample_rand: expect.stringMatching(/^0\.\d+$/),
    ...dsc,
  };

  const header = { sdk: { name: 'sentry.javascript.bun', version: SDK_VERSION }, trace };

  const runner = createRunner(__dirname, 'index.ts')
    .withMockSentryServer()
    .withEnv({ TRACES_SAMPLE_RATE: tracesSampleRate, TRACE_LIFECYCLE: lifecycle })
    .ignore(...(sampled ? (['event'] as const) : (['span', 'transaction'] as const)))
    .expectHeader(!sampled ? { event: header } : lifecycle === 'stream' ? { span: header } : { transaction: header })
    .start();

  const response = await runner.makeRequest<{ headers: Record<string, string> }>('get', path, {
    headers: { 'sentry-trace': sentryTrace, ...(baggage ? { baggage } : {}) },
  });

  const sampledFlag = dsc.sampled === 'true' ? '1' : '0';
  expect(response?.headers['sentry-trace']).toMatch(new RegExp(`^${TRACE_ID}-[\\da-f]{16}-${sampledFlag}$`));

  const outgoingBaggage = parseBaggageHeader(response?.headers.baggage) ?? {};
  expect(outgoingBaggage).toEqual(
    Object.fromEntries(Object.entries(trace).map(([key, value]) => [`sentry-${key}`, value])),
  );

  const sampleRand = Number(outgoingBaggage['sentry-sample_rand']);
  expect(sampleRand < Number(dsc.sample_rate)).toBe(dsc.sampled === 'true');

  await runner.completed();
}

describe.each<Lifecycle>(['stream', 'static'])('traceLifecycle: %s', lifecycle => {
  test('creates the DSC for an incoming sampled trace without baggage', async () => {
    await runCase(lifecycle, {
      sentryTrace: `${TRACE_ID}-${PARENT_SPAN_ID}-1`,
      path: '/fetch/123',
      tracesSampleRate: '0',
      sampled: true,
      dsc: { sample_rate: '1', sampled: 'true', transaction: 'GET /fetch/:id' },
    });
  });

  test('creates the DSC for an incoming sampled trace with only third-party baggage', async () => {
    await runCase(lifecycle, {
      sentryTrace: `${TRACE_ID}-${PARENT_SPAN_ID}-1`,
      baggage: 'foo=bar',
      path: '/fetch/123',
      tracesSampleRate: '0',
      sampled: true,
      dsc: { sample_rate: '1', sampled: 'true', transaction: 'GET /fetch/:id' },
    });
  });

  test('creates the DSC for an incoming unsampled trace without baggage', async () => {
    await runCase(lifecycle, {
      sentryTrace: `${TRACE_ID}-${PARENT_SPAN_ID}-0`,
      path: '/fetch/123',
      tracesSampleRate: '1',
      sampled: false,
      dsc: { sample_rate: '0', sampled: 'false', transaction: 'GET /fetch/:id' },
    });
  });

  test('creates the DSC for an incoming deferred trace without baggage, omitting a url-sourced transaction', async () => {
    await runCase(lifecycle, {
      sentryTrace: `${TRACE_ID}-${PARENT_SPAN_ID}`,
      path: '/plain',
      tracesSampleRate: '1',
      sampled: true,
      dsc: { sample_rate: '1', sampled: 'true' },
    });
  });
});
