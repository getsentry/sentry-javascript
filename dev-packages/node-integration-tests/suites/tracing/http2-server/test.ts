import {
  HTTP_RESPONSE_STATUS_CODE,
  NETWORK_PROTOCOL_VERSION,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SERVER_ADDRESS,
  URL_PATH,
  URL_QUERY,
} from '@sentry/conventions/attributes';
import { HTTP_SERVER } from '@sentry/conventions/op';
import { afterAll, describe, expect } from 'vitest';
import { supports } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe.runIf(supports({ min: 22, runtimes: ['node'] }))('http2 server', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('isolates compat API requests and continues their traces', async () => {
      await createRunner()
        .unordered()
        .expect({
          span: container => {
            const segment = container.items.find(item => item.is_segment);
            expect(segment?.attributes[URL_PATH]?.value).toBe('/users/42');

            expect(segment).toMatchObject({
              name: 'GET',
              trace_id: '12312012123120121231201212312012',
              parent_span_id: '1121201211212012',
              status: 'ok',
            });
            expect(segment?.attributes).toMatchObject({
              [SENTRY_OP]: { value: HTTP_SERVER },
              [SENTRY_ORIGIN]: { value: 'auto.http.http_server' },
              [URL_QUERY]: { value: 'q=1' },
              [SERVER_ADDRESS]: { value: 'localhost' },
              [NETWORK_PROTOCOL_VERSION]: { value: '2.0' },
              [HTTP_RESPONSE_STATUS_CODE]: { value: 200 },
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
            expect(event.contexts?.trace?.trace_id).toBe('45645645645645645645645645645645');
          },
        })
        .expect({
          span: container => {
            const segment = container.items.find(item => item.is_segment);
            expect(segment?.attributes[URL_PATH]?.value).toBe('/error');
            expect(segment?.status).toBe('error');
            expect(segment?.attributes[HTTP_RESPONSE_STATUS_CODE]?.value).toBe(500);
            expect(segment?.trace_id).toBe('45645645645645645645645645645645');
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
              [SENTRY_OP]: { value: HTTP_SERVER },
              [NETWORK_PROTOCOL_VERSION]: { value: '2.0' },
              [HTTP_RESPONSE_STATUS_CODE]: { value: 200 },
            });

            const fastifySpans = container.items.filter(
              item => item.attributes[SENTRY_ORIGIN]?.value === 'auto.http.fastify',
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
