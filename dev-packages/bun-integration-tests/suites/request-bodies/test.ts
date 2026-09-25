import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../node-integration-tests/utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('captures incoming request bodies by default', async () => {
  const runner = createRunner(__dirname, 'index.ts')
    .withMockSentryServer()
    .expect({
      transaction: transaction => {
        expect(transaction.request).toMatchObject({
          method: 'POST',
          url: expect.stringContaining('/default'),
          query_string: 'source=test',
          headers: expect.objectContaining({ 'content-type': 'text/plain' }),
          data: 'captured-by-default',
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
      transaction: transaction => {
        expect(transaction.request?.data).toBe(`${'a'.repeat(997)}...`);
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
      transaction: transaction => {
        expect(transaction.request?.method).toBe('POST');
        expect(transaction.request?.data).toBeUndefined();
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
