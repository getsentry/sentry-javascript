import { expect, test } from '@playwright/test';
import { waitForError } from '../../../test-utils/event-proxy-server';
import { pollEventOnSentry } from './utils';

test('Sends an ingestable client-side exception to Sentry', async ({ page }) => {
  await page.goto('/');

  const errorEventPromise = waitForError('nextjs-13-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Click Error';
  });

  await page.getByText('Throw error').click();

  const errorEvent = await errorEventPromise;
  const exceptionEventId = errorEvent.event_id;

  expect(exceptionEventId).toBeDefined();
  await pollEventOnSentry(exceptionEventId!);
});

// TODO: Fix that these tests are flakey on dev server - might be an SDK bug - might be Next.js itself
if (process.env.TEST_ENV !== 'development') {
  test('Sends an ingestable route handler exception to Sentry', async ({ page }) => {
    const errorEventPromise = waitForError('nextjs-13-app-dir', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'I am an error inside a dynamic route!';
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    await page.request.get('/dynamic-route/error/42');

    const errorEvent = await errorEventPromise;
    const exceptionEventId = errorEvent.event_id;

    expect(exceptionEventId).toBeDefined();
    await pollEventOnSentry(exceptionEventId!);
  });

  test('Sends an ingestable edge route handler exception to Sentry', async ({ page }) => {
    const errorEventPromise = waitForError('nextjs-13-app-dir', errorEvent => {
      console.log(errorEvent?.exception?.values?.[0]?.value);
      return errorEvent?.exception?.values?.[0]?.value === 'I am an error inside an edge route!';
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    await page.request.post('/edge-route/error');

    const errorEvent = await errorEventPromise;
    const exceptionEventId = errorEvent.event_id;

    expect(exceptionEventId).toBeDefined();
    await pollEventOnSentry(exceptionEventId!);
  });
}
