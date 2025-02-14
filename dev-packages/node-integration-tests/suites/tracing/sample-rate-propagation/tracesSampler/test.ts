import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

describe('parentSampleRate propagation with tracesSampler', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should propagate sample_rate equivalent to sample rate returned by tracesSampler when there is no incoming trace', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check');
    expect((response as any).propagatedData.baggage).toMatch(/sentry-sample_rate=0\.69/);
  });

  test('should propagate sample_rate equivalent to sample rate returned by tracesSampler when there is no incoming sample rate (1 -> because there is a positive sampling decision and inheritOrSampleWith was used)', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check', {
      headers: {
        'sentry-trace': '530699e319cc067ce440315d74acb312-414dc2a08d5d1dac-1',
        baggage: '',
      },
    });

    expect((response as any).propagatedData.baggage).toMatch(/sentry-sample_rate=1/);
  });

  test('should propagate sample_rate equivalent to sample rate returned by tracesSampler when there is no incoming sample rate (0 -> because there is a negative sampling decision and inheritOrSampleWith was used)', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check', {
      headers: {
        'sentry-trace': '530699e319cc067ce440315d74acb312-414dc2a08d5d1dac-0',
        baggage: '',
      },
    });

    expect((response as any).propagatedData.baggage).toMatch(/sentry-sample_rate=0/);
  });

  test('should propagate sample_rate equivalent to sample rate returned by tracesSampler when there is no incoming sample rate (the fallback value -> because there is no sampling decision and inheritOrSampleWith was used)', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check', {
      headers: {
        'sentry-trace': '530699e319cc067ce440315d74acb312-414dc2a08d5d1dac',
        baggage: '',
      },
    });

    expect((response as any).propagatedData.baggage).toMatch(/sentry-sample_rate=0\.69/);
  });

  test('should propagate sample_rate equivalent to incoming sample_rate (because tracesSampler is configured that way)', async () => {
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
