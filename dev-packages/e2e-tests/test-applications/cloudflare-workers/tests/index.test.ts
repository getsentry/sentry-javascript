import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Index page', async ({ page }) => {
  const result = await page.goto('http://localhost:8787/');
  expect(result?.status?.()).toBe(200);
  await expect(page.textContent('body > pre')).resolves.toBe('Hello World!');
})

test('worker\'s withSentry', async () => {
  const eventWaiter = waitForError('cloudflare-workers', (event) => {
    return event.exception?.values?.[0]?.mechanism?.type === 'cloudflare';
  });
  const response = await fetch('http://localhost:8787/throwException');
  expect(response.status).toBe(500);
  const event = await eventWaiter;
  expect(event.exception?.values?.[0]?.value).toBe('To be recorded in Sentry.');
})

test('RPC method which throws an exception to be logged to sentry', async () => {
  const eventWaiter = waitForError('cloudflare-workers', (event) => {
		return event.exception?.values?.[0]?.mechanism?.type === 'cloudflare_durableobject';
	});
	const response = await fetch('http://localhost:8787/rpc/throwException');
	expect(response.status).toBe(500);
	const event = await eventWaiter;
  expect(event.exception?.values?.[0]?.value).toBe('Should be recorded in Sentry.');
});
test('Request processed by DurableObject\'s fetch is recorded', async () => {
  const eventWaiter = waitForError('cloudflare-workers', (event) => {
    return event.exception?.values?.[0]?.mechanism?.type === 'cloudflare_durableobject';
  });
  const response = await fetch('http://localhost:8787/pass-to-object/throwException');
  expect(response.status).toBe(500);
  const event = await eventWaiter;
  expect(event.exception?.values?.[0]?.value).toBe('Should be recorded in Sentry.');
});
