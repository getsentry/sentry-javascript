import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('errors in TwP mode have same trace in trace context and getTraceData()', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('in incoming request', done => {
    createRunner(__dirname, 'server.js')
      .expect({
        event: event => {
          const { contexts } = event;
          const { trace_id, span_id } = contexts?.trace || {};
          expect(trace_id).toMatch(/^[a-f0-9]{32}$/);
          expect(span_id).toMatch(/^[a-f0-9]{16}$/);

          const traceData = contexts?.traceData || {};

          expect(traceData['sentry-trace']).toEqual(`${trace_id}-${span_id}`);

          expect(traceData.baggage).toContain(`sentry-trace_id=${trace_id}`);
          expect(traceData.baggage).not.toContain('sentry-sampled=');

          expect(traceData.metaTags).toContain(`<meta name="sentry-trace" content="${trace_id}-${span_id}"/>`);
          expect(traceData.metaTags).toContain(`sentry-trace_id=${trace_id}`);
          expect(traceData.metaTags).not.toContain('sentry-sampled=');
        },
      })
      .start(done)
      .makeRequest('get', '/test');
  });

  test('outside of a request handler', done => {
    createRunner(__dirname, 'no-server.js')
      .expect({
        event: event => {
          const { contexts } = event;
          const { trace_id, span_id } = contexts?.trace || {};
          expect(trace_id).toMatch(/^[a-f0-9]{32}$/);
          expect(span_id).toMatch(/^[a-f0-9]{16}$/);

          const traceData = contexts?.traceData || {};

          expect(traceData['sentry-trace']).toEqual(`${trace_id}-${span_id}`);
          expect(traceData.baggage).toContain(`sentry-trace_id=${trace_id}`);
          expect(traceData.baggage).not.toContain('sentry-sampled=');

          expect(traceData.metaTags).toContain(`<meta name="sentry-trace" content="${trace_id}-${span_id}"/>`);
          expect(traceData.metaTags).toContain(`sentry-trace_id=${trace_id}`);
          expect(traceData.metaTags).not.toContain('sentry-sampled=');
        },
      })
      .start(done);
  });
});
