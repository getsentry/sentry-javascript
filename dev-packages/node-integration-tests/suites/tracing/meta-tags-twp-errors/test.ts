import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('errors in TwP mode have same trace in trace context and getTraceData()', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // In a request handler, the spanId is consistent inside of the request
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

  // Outside of a request handler, the spanId is random
  test('outside of a request handler', done => {
    createRunner(__dirname, 'no-server.js')
      .expect({
        event: event => {
          const { contexts } = event;
          const { trace_id, span_id } = contexts?.trace || {};
          expect(trace_id).toMatch(/^[a-f0-9]{32}$/);
          expect(span_id).toMatch(/^[a-f0-9]{16}$/);

          const traceData = contexts?.traceData || {};

          expect(traceData['sentry-trace']).toMatch(/^[a-f0-9]{32}-[a-f0-9]{16}$/);
          expect(traceData['sentry-trace']).toContain(`${trace_id}-`);
          // span_id is a random span ID
          expect(traceData['sentry-trace']).not.toContain(span_id);

          expect(traceData.baggage).toContain(`sentry-trace_id=${trace_id}`);
          expect(traceData.baggage).not.toContain('sentry-sampled=');

          expect(traceData.metaTags).toMatch(/<meta name="sentry-trace" content="[a-f0-9]{32}-[a-f0-9]{16}"\/>/);
          expect(traceData.metaTags).toContain(`<meta name="sentry-trace" content="${trace_id}-`);
          // span_id is a random span ID
          expect(traceData.metaTags).not.toContain(span_id);
          expect(traceData.metaTags).toContain(`sentry-trace_id=${trace_id}`);
          expect(traceData.metaTags).not.toContain('sentry-sampled=');
        },
      })
      .start(done);
  });
});
