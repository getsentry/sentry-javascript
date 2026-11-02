import { afterAll, describe, expect } from 'vitest';
import { supports } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// Node publishes the `http2.server.stream.*` channels from 22.17.0 and 24.2.0.
describe.runIf(supports({ min: 22, runtimes: ['node'] }))('http2 server', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('isolates compat API requests and continues their traces', async () => {
      let errorTraceId: string | undefined;

      await createRunner()
        .unordered()
        .expect({
          span: container => {
            const segment = container.items.find(item => item.is_segment);
            expect(segment?.attributes['url.path']?.value).toBe('/users/42');

            expect(segment).toMatchObject({
              name: 'GET',
              trace_id: '12312012123120121231201212312012',
              parent_span_id: '1121201211212012',
              status: 'ok',
            });
            expect(segment?.attributes).toMatchObject({
              'sentry.op': { value: 'http.server' },
              'sentry.origin': { value: 'auto.http.http_server' },
              'url.query': { value: 'q=1' },
              'server.address': { value: 'localhost' },
              'network.protocol.version': { value: '2.0' },
              'http.response.status_code': { value: 200 },
            });
            expect(Object.keys(segment?.attributes ?? {}).filter(key => key.includes(':'))).toEqual([]);

            const child = container.items.find(item => item.name === 'handler-work');
            expect(child?.parent_span_id).toBe(segment?.span_id);
          },
        })
        .expect({
          event: event => {
            expect(event.exception?.values?.[0]?.value).toBe('error in http2 handler');
            expect(event.request?.url).toMatch(/^http:\/\/localhost:\d+\/error$/);
            expect(event.request?.method).toBe('GET');
            expect(Object.keys(event.request?.headers ?? {}).filter(key => key.startsWith(':'))).toEqual([]);
            expect(event.transaction).toBe('GET /error');
            errorTraceId = event.contexts?.trace?.trace_id;
          },
        })
        .expect({
          span: container => {
            const segment = container.items.find(item => item.is_segment);
            expect(segment?.attributes['url.path']?.value).toBe('/error');
            expect(segment?.status).toBe('error');
            expect(segment?.attributes['http.response.status_code']?.value).toBe(500);
            expect(segment?.trace_id).toBe(errorTraceId);
          },
        })
        .start()
        .completed();
    });

    test('does not trigger HTTP/2 compat API warnings', async () => {
      await createRunner().ensureNoErrorOutput().start().completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-fastify.mjs', 'instrument.mjs', (createRunner, test) => {
    test('nests fastify spans under the HTTP/2 server span', async () => {
      await createRunner()
        .expect({
          span: container => {
            const segment = container.items.find(item => item.is_segment);
            expect(segment?.name).toBe('GET /users/:id');
            expect(segment?.attributes).toMatchObject({
              'sentry.op': { value: 'http.server' },
              'network.protocol.version': { value: '2.0' },
              'http.response.status_code': { value: 200 },
            });

            const fastifySpans = container.items.filter(
              item => item.attributes['sentry.origin']?.value === 'auto.http.fastify',
            );
            expect(fastifySpans.length).toBeGreaterThan(0);
            for (const span of fastifySpans) {
              expect(span.trace_id).toBe(segment?.trace_id);
            }
          },
        })
        .start()
        .completed();
    });
  });
});
