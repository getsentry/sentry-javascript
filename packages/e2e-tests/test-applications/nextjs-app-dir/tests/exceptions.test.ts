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

// test('Sends an ingestable route handler exception to Sentry', async ({ page }) => {
//   await page.goto('/');

//   const errorEventPromise = waitForError('nextjs-13-app-dir', errorEvent => {
//     return errorEvent?.exception?.values?.[0]?.value === 'Click Error';
//   });

//   await page.getByText('Throw error').click();

//   const errorEvent = await errorEventPromise;
//   const exceptionEventId = errorEvent.event_id;

//   expect(exceptionEventId).toBeDefined();
//   await pollEventOnSentry(exceptionEventId!);
// });
