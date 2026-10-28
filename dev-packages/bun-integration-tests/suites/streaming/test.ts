import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../node-integration-tests/utils/runner';

afterAll(cleanupChildProcesses);

test('records streaming work after the response headers have been returned', async () => {
  const runner = createRunner(__dirname, 'index.ts')
    .withMockSentryServer()
    .unordered()
    .expect({
      span: container => {
        const root = container.items.find(item => item.is_segment);
        expect(root).toEqual(
          expect.objectContaining({
            attributes: expect.objectContaining({
              'url.path': { value: '/events', type: 'string' },
              'http.response.status_code': { value: 201, type: 'integer' },
              'test.stream.completed': { value: true, type: 'boolean' },
            }),
          }),
        );
      },
    })
    .start();
  expect(await runner.makeRequest('get', '/events')).toBe('data: first\n\ndata: recording=true\n\n');
  await runner.completed();
});

test('records a thrown handler as an error span', async () => {
  const runner = createRunner(__dirname, 'index.ts')
    .withMockSentryServer()
    .unordered()
    .expect({
      span: container => {
        const root = container.items.find(item => item.is_segment);
        expect(root).toEqual(expect.objectContaining({ status: 'error' }));
      },
    })
    .start();
  await runner.makeRequest('get', '/error', { expectError: true });
  await runner.completed();
});

test('captures a response stream failure with its request context and error span', async () => {
  let spanTraceId: string | undefined;
  let eventTraceId: string | undefined;
  const runner = createRunner(__dirname, 'index.ts')
    .withMockSentryServer()
    .unordered()
    .expect({
      span: container => {
        const roots = container.items.filter(item => item.is_segment);
        expect(roots).toHaveLength(1);
        const root = roots[0]!;
        expect(root.status).toBe('error');
        expect(root.attributes['url.path']?.value).toBe('/stream-error');
        expect(root.attributes['http.response.status_code']?.value).toBe(201);
        spanTraceId = root.trace_id;
      },
    })
    .expect({
      event: event => {
        expect(event.exception?.values).toHaveLength(1);
        const exception = event.exception!.values![0]!;
        expect(exception.type).toBe('Error');
        expect(exception.value).toBe('stream failed');
        expect(exception.mechanism).toEqual({ type: 'auto.http.bun.serve', handled: false });
        expect(event.request?.method).toBe('GET');
        expect(new URL(event.request!.url!).pathname).toBe('/stream-error');
        eventTraceId = event.contexts?.trace?.trace_id;
      },
    })
    .start();

  await expect.poll(() => runner.getPort(), { timeout: 30_000 }).toBeTypeOf('number');
  const response = await fetch(`http://localhost:${runner.getPort()}/stream-error`);
  expect(response.status).toBe(201);
  // Bun versions differ in whether a failed stream rejects or closes the HTTP response body.
  await Promise.allSettled([response.text()]);
  await runner.completed();
  expect(spanTraceId).toMatch(/^[a-f\d]{32}$/);
  expect(eventTraceId).toBe(spanTraceId);
});
