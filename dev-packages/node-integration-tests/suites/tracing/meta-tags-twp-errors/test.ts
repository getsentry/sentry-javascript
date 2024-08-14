import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('errors in Tracing without Performance mode', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('error has the same traceId as obtained via getTraceData()/getTraceMetaTags()', async () => {
    const runner = createRunner(__dirname, 'server.js').start();

    const response = await runner.makeRequest('get', '/test');

    console.log('response: ', response);

    const { traceData, traceMetaTags, errorTraceContext } = response as {
      traceData: Record<string, string>;
      traceMetaTags: string;
      errorTraceContext: {
        trace_id: string;
        span_id: string;
      };
    };

    const traceId = errorTraceContext?.trace_id;
    const spanId = errorTraceContext?.span_id;

    expect(traceId).toMatch(/^[a-f0-9]{32}$/);
    expect(spanId).toMatch(/^[a-f0-9]{16}$/);

    expect(errorTraceContext).toEqual({
      trace_id: traceId,
      span_id: spanId,
    });

    expect(traceData).toEqual({
      'sentry-trace': `${traceId}-${spanId}`,
      baggage: expect.stringContaining(`sentry-trace_id=${traceId}`),
    });

    expect(traceMetaTags).toContain(`content="${traceId}-${spanId}"/>\n`);
    expect(traceMetaTags).toContain(`sentry-trace_id=${traceId}`);
  });
});
