import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Should record exceptions captured inside handlers', async ({ request }) => {
  const errorEventPromise = waitForError('node-express-esm-without-loader', errorEvent => {
    return !!errorEvent?.exception?.values?.[0]?.value?.includes('This is an error');
  });

  await request.get('/test-error');

  await expect(errorEventPromise).resolves.toBeDefined();
});

test('Isolates requests', async ({ request }) => {
  const errorEventPromise = waitForError('node-express-esm-without-loader', errorEvent => {
    return !!errorEvent?.exception?.values?.[0]?.value?.includes('Error for param 1');
  });

  const errorEventPromise2 = waitForError('node-express-esm-without-loader', errorEvent => {
    return !!errorEvent?.exception?.values?.[0]?.value?.includes('Error for param 2');
  });

  await request.get('/test-params/1');
  await request.get('/test-params/2');

  const errorEvent1 = await errorEventPromise;
  const errorEvent2 = await errorEventPromise2;

  expect(errorEvent1.tags).toEqual({ 'param-1': 'yes' });
  expect(errorEvent2.tags).toEqual({ 'param-2': 'yes' });

  expect(errorEvent1.transaction).toBe('GET /test-params/1');
  expect(errorEvent2.transaction).toBe('GET /test-params/2');
});
