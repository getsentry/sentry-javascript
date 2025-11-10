import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('sample_rand propagation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('propagates a sample rand when there are no incoming trace headers', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check');
    expect(response).toEqual({
      propagatedData: {
        baggage: expect.stringMatching(/sentry-sample_rand=0\.\d+/),
      },
    });
  });

  test('propagates a sample rand when there is a sentry-trace header and incoming sentry baggage', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check', {
      headers: {
        'sentry-trace': '530699e319cc067ce440315d74acb312-414dc2a08d5d1dac-1',
        baggage: 'sentry-release=foo,sentry-sample_rand=0.424242',
      },
    });
    expect(response).toEqual({
      propagatedData: {
        baggage: expect.stringMatching(/sentry-sample_rand=0\.424242/),
      },
    });
  });

  test('propagates a sample rand when there is an incoming sentry-trace header but no baggage header', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check', {
      headers: {
        'sentry-trace': '530699e319cc067ce440315d74acb312-414dc2a08d5d1dac-1',
      },
    });
    expect(response).toEqual({
      propagatedData: {
        baggage: expect.stringMatching(/sentry-sample_rand=0\.\d+/),
      },
    });
  });

  test('propagates a sample_rand that would lead to a positive sampling decision when there is an incoming positive sampling decision but no sample_rand in the baggage header', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check', {
      headers: {
        'sentry-trace': '530699e319cc067ce440315d74acb312-414dc2a08d5d1dac-1',
        baggage: 'sentry-sample_rate=0.25',
      },
    });

    const sampleRand = Number((response as any).propagatedData.baggage.match(/sentry-sample_rand=(0\.\d+)/)[1]);

    expect(sampleRand).toStrictEqual(expect.any(Number));
    expect(sampleRand).not.toBeNaN();
    expect(sampleRand).toBeLessThan(0.25);
    expect(sampleRand).toBeGreaterThanOrEqual(0);
  });

  test('propagates a sample_rand that would lead to a negative sampling decision when there is an incoming negative sampling decision but no sample_rand in the baggage header', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check', {
      headers: {
        'sentry-trace': '530699e319cc067ce440315d74acb312-414dc2a08d5d1dac-0',
        baggage: 'sentry-sample_rate=0.75',
      },
    });

    const sampleRand = Number((response as any).propagatedData.baggage.match(/sentry-sample_rand=(0\.\d+)/)[1]);

    expect(sampleRand).toStrictEqual(expect.any(Number));
    expect(sampleRand).not.toBeNaN();
    expect(sampleRand).toBeGreaterThanOrEqual(0.75);
    expect(sampleRand).toBeLessThan(1);
  });

  test('a new sample_rand when there is no sentry-trace header but a baggage header with sample_rand', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check', {
      headers: {
        baggage: 'sentry-sample_rate=0.75,sentry-sample_rand=0.5',
      },
    });

    expect((response as any).propagatedData.baggage).toMatch(/sentry-sample_rand=0\.\d+/);
    const sampleRandStr = (response as any).propagatedData.baggage.match(/sentry-sample_rand=(0\.\d+)/)[1];
    expect(sampleRandStr).not.toBe('0.5');
  });
});
