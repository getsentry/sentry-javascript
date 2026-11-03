import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../node-integration-tests/utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('captures incoming request bodies by default', async () => {
  const runner = createRunner(__dirname, 'index.ts')
    .withMockSentryServer()
    .expect({
      span: container => {
        const span = container.items.find(span => span.is_segment);
        expect(span).toBeDefined();
        expect(span?.attributes['http.request.method']).toEqual({ value: 'POST', type: 'string' });
        expect(span?.attributes['url.full']).toEqual({
          value: expect.stringContaining('/default'),
          type: 'string',
        });
        expect(span?.attributes['url.query']).toEqual({ value: 'source=test', type: 'string' });
        expect(span?.attributes['http.request.header.content-type']).toEqual({
          value: ['text/plain'],
          type: 'array',
        });
        expect(span?.attributes['http.request.body.data']).toEqual({
          value: 'captured-by-default',
          type: 'string',
        });
      },
    })
    .start();

  const response = await runner.makeRequest<string>('post', '/default?source=test', {
    headers: { 'content-type': 'text/plain' },
    data: 'captured-by-default',
  });
  expect(response).toBe('captured-by-default');
  await runner.completed();
});

test('an explicit small size overrides disabled body collection', async () => {
  const runner = createRunner(__dirname, 'index.ts')
    .withMockSentryServer()
    .withEnv({ BODY_MODE: 'explicit-small' })
    .expect({
      span: container => {
        const span = container.items.find(span => span.is_segment);
        expect(span).toBeDefined();
        expect(span?.attributes['http.request.body.data']?.value).toBe(`${'a'.repeat(997)}...`);
      },
    })
    .start();

  const body = 'a'.repeat(1_001);
  const response = await runner.makeRequest<string>('post', '/explicit-small', {
    headers: { 'content-type': 'text/plain' },
    data: body,
  });
  expect(response).toBe(body);
  await runner.completed();
});

test('an explicit none overrides enabled body collection', async () => {
  const runner = createRunner(__dirname, 'index.ts')
    .withMockSentryServer()
    .withEnv({ BODY_MODE: 'explicit-none' })
    .expect({
      span: container => {
        const span = container.items.find(span => span.is_segment);
        expect(span).toBeDefined();
        expect(span?.attributes['http.request.method']?.value).toBe('POST');
        expect(span?.attributes['http.request.body.data']).toBeUndefined();
      },
    })
    .start();

  const response = await runner.makeRequest<string>('post', '/explicit-none', {
    headers: { 'content-type': 'text/plain' },
    data: 'do-not-capture',
  });
  expect(response).toBe('do-not-capture');
  await runner.completed();
});
