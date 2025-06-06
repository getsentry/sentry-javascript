import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

describe('parentSampleRate propagation with tracesSampleRate', () => {
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

  test('should not propagate configured sample rate when receiving a trace without sampling decision and sample rate', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check', {
      headers: {
        'sentry-trace': '530699e319cc067ce440315d74acb312-414dc2a08d5d1dac',
        baggage: '',
      },
    });

    expect((response as any).propagatedData.baggage).not.toMatch(/sentry-sample_rate=0\.69/);
  });

  test('should not propagate configured sample rate when receiving a trace without sampling decision, but with sample rate', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check', {
      headers: {
        'sentry-trace': '530699e319cc067ce440315d74acb312-414dc2a08d5d1dac',
        baggage: 'sentry-sample_rate=0.1337',
      },
    });

    expect((response as any).propagatedData.baggage).not.toMatch(/sentry-sample_rate=0\.69/);
  });

  test('should not propagate configured sample rate when there is no incoming trace', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check');
    expect((response as any).propagatedData.baggage).not.toMatch(/sentry-sample_rate=0\.69/);
  });
});
