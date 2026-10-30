import { parseBaggageHeader } from '@sentry/core';
import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

const LIFECYCLES = ['stream', 'static'] as const;

describe('parentSampleRate propagation with no tracing enabled', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should propagate an incoming sample rate', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check', {
      headers: {
        'sentry-trace': '530699e319cc067ce440315d74acb312-414dc2a08d5d1dac-1',
        baggage: 'sentry-sample_rate=0.1337',
      },
    });

    expect((response as any).propagatedData.baggage).toMatch(/sentry-sample_rate=0\.1337/);
  });

  test.each(LIFECYCLES)(
    'propagates a client-only DSC for an incoming trace without baggage (traceLifecycle: %s)',
    async lifecycle => {
      const runner = createRunner(__dirname, 'server.js').withEnv({ TRACE_LIFECYCLE: lifecycle }).start();
      const response = await runner.makeRequest('get', '/check', {
        headers: {
          'sentry-trace': '530699e319cc067ce440315d74acb312-414dc2a08d5d1dac-1',
        },
      });

      expect(parseBaggageHeader((response as any).propagatedData.baggage)).toStrictEqual({
        'sentry-environment': 'production',
        'sentry-public_key': 'public',
        'sentry-release': '1.0',
        'sentry-trace_id': '530699e319cc067ce440315d74acb312',
      });
    },
  );

  test('should not propagate a sample rate for root traces', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check');
    expect((response as any).propagatedData.baggage).not.toMatch(/sentry-sample_rate/);
  });
});
