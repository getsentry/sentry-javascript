import { parseBaggageHeader } from '@sentry/core';
import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

const LIFECYCLES = ['stream', 'static'] as const;

describe('parentSampleRate propagation with tracesSampler', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should propagate sample_rate equivalent to sample rate returned by tracesSampler when there is no incoming trace', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check');
    expect((response as any).propagatedData.baggage).toMatch(/sentry-sample_rate=0\.69/);
  });

  test.each(LIFECYCLES)(
    'propagates sample_rate equivalent to sample rate returned by tracesSampler when there is no incoming sample rate (traceLifecycle: %s)',
    async lifecycle => {
      const runner = createRunner(__dirname, 'server.js').withEnv({ TRACE_LIFECYCLE: lifecycle }).start();
      const response = await runner.makeRequest('get', '/check', {
        headers: {
          'sentry-trace': '530699e319cc067ce440315d74acb312-414dc2a08d5d1dac-1',
          baggage: '',
        },
      });

      expect(parseBaggageHeader((response as any).propagatedData.baggage)).toMatchObject({
        'sentry-environment': 'production',
        'sentry-public_key': 'public',
        'sentry-trace_id': '530699e319cc067ce440315d74acb312',
        'sentry-sample_rand': expect.stringMatching(/^0\.\d+$/),
        'sentry-sample_rate': '1', //  1 because there is a positive sampling decision and inheritOrSampleWith was used
        'sentry-sampled': 'true',
      });
    },
  );

  test.each(LIFECYCLES)(
    'propagates sample_rate equivalent to sample rate returned by tracesSampler when there is no incoming sample rate (traceLifecycle: %s)',
    async lifecycle => {
      const runner = createRunner(__dirname, 'server.js').withEnv({ TRACE_LIFECYCLE: lifecycle }).start();
      const response = await runner.makeRequest('get', '/check', {
        headers: {
          'sentry-trace': '530699e319cc067ce440315d74acb312-414dc2a08d5d1dac-0',
          baggage: '',
        },
      });

      expect(parseBaggageHeader((response as any).propagatedData.baggage)).toMatchObject({
        'sentry-environment': 'production',
        'sentry-public_key': 'public',
        'sentry-trace_id': '530699e319cc067ce440315d74acb312',
        'sentry-sample_rand': expect.stringMatching(/^0\.\d+$/),
        'sentry-sample_rate': '0', // 0 because there is a negative sampling decision and inheritOrSampleWith was used
        'sentry-sampled': 'false',
      });
    },
  );

  test.each(LIFECYCLES)(
    'propagates sample_rate equivalent to sample rate returned by tracesSampler when there is no incoming sample rate (the fallback value -> because there is no sampling decision and inheritOrSampleWith was used) (traceLifecycle: %s)',
    async lifecycle => {
      const runner = createRunner(__dirname, 'server.js').withEnv({ TRACE_LIFECYCLE: lifecycle }).start();
      const response = await runner.makeRequest('get', '/check', {
        headers: {
          'sentry-trace': '530699e319cc067ce440315d74acb312-414dc2a08d5d1dac',
          baggage: '',
        },
      });

      const baggage = parseBaggageHeader((response as any).propagatedData.baggage);
      expect(baggage).toMatchObject({
        'sentry-environment': 'production',
        'sentry-public_key': 'public',
        'sentry-trace_id': '530699e319cc067ce440315d74acb312',
        'sentry-sample_rand': expect.stringMatching(/^0\.\d+$/),
        'sentry-sample_rate': '0.69',
        'sentry-sampled': expect.stringMatching(/^(true|false)$/),
      });
      expect(Number(baggage?.['sentry-sample_rand']) < 0.69).toBe(baggage?.['sentry-sampled'] === 'true');
    },
  );

  test('propagates sample_rate equivalent to incoming sample_rate (because tracesSampler is configured that way)', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check', {
      headers: {
        'sentry-trace': '530699e319cc067ce440315d74acb312-414dc2a08d5d1dac-1',
        baggage: 'sentry-sample_rate=0.1337',
      },
    });

    expect((response as any).propagatedData.baggage).toMatch(/sentry-sample_rate=0\.1337/);
  });
});
