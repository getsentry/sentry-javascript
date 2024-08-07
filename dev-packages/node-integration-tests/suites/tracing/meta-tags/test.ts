import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('getTraceMetaTags', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('injects sentry tracing <meta> tags', async () => {
    const traceId = 'cd7ee7a6fe3ebe7ab9c3271559bc203c';
    const parentSpanId = '100ff0980e7a4ead';

    const runner = createRunner(__dirname, 'server.js').start();

    const response = await runner.makeRequest('get', '/test', {
      'sentry-trace': `${traceId}-${parentSpanId}-1`,
      baggage: 'sentry-environment=production',
    });

    // @ts-ignore - response is defined, types just don't reflect it
    const html = response?.response as unknown as string;

    expect(html).toMatch(/<meta name="sentry-trace" content="cd7ee7a6fe3ebe7ab9c3271559bc203c-[a-z0-9]{16}-1"\/>/);
    expect(html).toContain('<meta name="baggage" content="sentry-environment=production"/>');
  });
});
