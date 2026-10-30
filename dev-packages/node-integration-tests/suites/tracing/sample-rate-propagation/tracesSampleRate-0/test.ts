import { parseBaggageHeader } from '@sentry/core';
import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

const LIFECYCLES = ['stream', 'static'] as const;

describe('parentSampleRate propagation with tracesSampleRate=0', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should propagate incoming sample rate when inheriting a positive sampling decision', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check', {
      headers: {
        'sentry-trace': '530699e319cc067ce440315d74acb312-414dc2a08d5d1dac-1',
        baggage: 'sentry-sample_rate=0.1337',
      },
    });

    expect((response as any).propagatedData.baggage).toMatch(/sentry-sample_rate=0\.1337/);
  });

  test('should propagate incoming sample rate when inheriting a negative sampling decision', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check', {
      headers: {
        'sentry-trace': '530699e319cc067ce440315d74acb312-414dc2a08d5d1dac-0',
        baggage: 'sentry-sample_rate=0.1337',
      },
    });

    expect((response as any).propagatedData.baggage).toMatch(/sentry-sample_rate=0\.1337/);
  });

  test.each(LIFECYCLES)(
    'propagates sample rate 1 when inheriting a positive sampling decision without incoming sample rate (traceLifecycle: %s)',
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
        'sentry-sample_rate': '1',
        'sentry-sampled': 'true',
      });
    },
  );

  test.each(LIFECYCLES)(
    'propagates sample rate 0 when inheriting a negative sampling decision without incoming sample rate (traceLifecycle: %s)',
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
        'sentry-sample_rate': '0',
        'sentry-sampled': 'false',
      });
    },
  );

  test('should propagate configured sample rate when receiving a trace without sampling decision and sample rate', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check', {
      headers: {
        'sentry-trace': '530699e319cc067ce440315d74acb312-414dc2a08d5d1dac',
        baggage: '',
      },
    });

    expect((response as any).propagatedData.baggage).toMatch(/sentry-sample_rate=0/);
  });

  test('should propagate configured sample rate when receiving a trace without sampling decision, but with sample rate', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check', {
      headers: {
        'sentry-trace': '530699e319cc067ce440315d74acb312-414dc2a08d5d1dac',
        baggage: 'sentry-sample_rate=0.1337',
      },
    });

    expect((response as any).propagatedData.baggage).toMatch(/sentry-sample_rate=0/);
  });

  test('should propagate configured sample rate when there is no incoming trace', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check');
    expect((response as any).propagatedData.baggage).toMatch(/sentry-sample_rate=0/);
  });
});
