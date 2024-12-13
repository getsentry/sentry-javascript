import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Sends correct error event', async ({ page }) => {
  const errorEventPromise = waitForError('react-router-6-use-routes', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'I am an error!';
  });

  await page.goto('/');

  const exceptionButton = page.locator('id=exception-button');
  await exceptionButton.click();

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('I am an error!');

  expect(errorEvent.request).toEqual({
    headers: expect.any(Object),
    url: 'http://localhost:3030/',
  });

  expect(errorEvent.transaction).toEqual('/');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
  });
});

test('Sets correct transactionName', async ({ page }) => {
  const transactionPromise = waitForTransaction('react-router-6-use-routes', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const errorEventPromise = waitForError('react-router-6-use-routes', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'I am an error!';
  });

  await page.goto('/');
  const transactionEvent = await transactionPromise;

  // Only capture error once transaction was sent
  const exceptionButton = page.locator('id=exception-button');
  await exceptionButton.click();

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('I am an error!');

  expect(errorEvent.transaction).toEqual('/');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: transactionEvent.contexts?.trace?.trace_id,
    span_id: expect.not.stringContaining(transactionEvent.contexts?.trace?.span_id || ''),
  });
});
