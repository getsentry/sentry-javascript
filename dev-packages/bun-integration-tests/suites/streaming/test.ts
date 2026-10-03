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
