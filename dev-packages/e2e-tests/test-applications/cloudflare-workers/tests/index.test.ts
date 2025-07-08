import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Index page', async ({ baseURL }) => {
  const result = await fetch(baseURL!);
  expect(result.status).toBe(200);
  await expect(result.text()).resolves.toBe('Hello World!');
})

test('worker\'s withSentry', async ({baseURL}) => {
  const eventWaiter = waitForError('cloudflare-workers', (event) => {
    return event.exception?.values?.[0]?.mechanism?.type === 'cloudflare';
  });
  const response = await fetch(`${baseURL}/throwException`);
  expect(response.status).toBe(500);
  const event = await eventWaiter;
  expect(event.exception?.values?.[0]?.value).toBe('To be recorded in Sentry.');
})

test('RPC method which throws an exception to be logged to sentry', async ({baseURL}) => {
  const eventWaiter = waitForError('cloudflare-workers', (event) => {
		return event.exception?.values?.[0]?.mechanism?.type === 'cloudflare_durableobject';
	});
	const response = await fetch(`${baseURL}/rpc/throwException`);
	expect(response.status).toBe(500);
	const event = await eventWaiter;
  expect(event.exception?.values?.[0]?.value).toBe('Should be recorded in Sentry.');
});
test('Request processed by DurableObject\'s fetch is recorded', async ({baseURL}) => {
  const eventWaiter = waitForError('cloudflare-workers', (event) => {
    return event.exception?.values?.[0]?.mechanism?.type === 'cloudflare_durableobject';
  });
  const response = await fetch(`${baseURL}/pass-to-object/throwException`);
  expect(response.status).toBe(500);
  const event = await eventWaiter;
  expect(event.exception?.values?.[0]?.value).toBe('Should be recorded in Sentry.');
});
