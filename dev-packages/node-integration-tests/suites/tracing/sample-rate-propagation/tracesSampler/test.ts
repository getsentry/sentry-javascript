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

  test('should propagate sample_rate equivalent to sample rate returned by tracesSampler when there is no incoming sample rate', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check', {
      headers: {
        'sentry-trace': '530699e319cc067ce440315d74acb312-414dc2a08d5d1dac-1',
        baggage: '',
      },
    });

    expect((response as any).propagatedData.baggage).toMatch(/sentry-sample_rate=0\.69/);
  });

  test.only('should propagate sample_rate equivalent to incoming sample_rate (because tracesSampler is configured that way)', async () => {
    const runner = createRunner(__dirname, 'server.js').start();
    const response = await runner.makeRequest('get', '/check', {
      headers: {
        'sentry-trace': '530699e319cc067ce440315d74acb312-414dc2a08d5d1dac-1',
        baggage: 'sentry-sample_rate=0.1337,sentry-sample_rand=0.444',
      },
    });

    expect((response as any).propagatedData.baggage).toMatch(/sentry-sample_rate=0\.1337/);
  });
});
