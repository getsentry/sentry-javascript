import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('lastEventId() should return the event ID after captureUnderscoreErrorException', async ({ page }) => {
  test.skip(!!process.env.TEST_ENV?.includes('development'), 'should be skipped for non-dev mode');

  const errorEventPromise = waitForError('nextjs-pages-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Test error to trigger _error.tsx page';
  });

  await page.goto('/underscore-error/test-error-page');
  const errorEvent = await errorEventPromise;

  // Since the error is already captured by withErrorInstrumentation in getServerSideProps,
  // the mechanism should be 'auto.function.nextjs.wrapped', not 'auto.function.nextjs.underscore_error'
  expect(errorEvent.exception?.values?.[0]?.mechanism?.type).toBe('auto.function.nextjs.wrapped');
  // The function name might be e.g. 'getServerSideProps$1'
  expect(errorEvent.exception?.values?.[0]?.mechanism?.data?.function).toContain('getServerSideProps');
  expect(errorEvent.exception?.values?.[0]?.mechanism?.handled).toBe(false);

  const eventIdFromReturn = await page.locator('[data-testid="event-id"]').textContent();
  const returnedEventId = eventIdFromReturn?.replace('Event ID from return: ', '');

  const lastEventIdFromFunction = await page.locator('[data-testid="last-event-id"]').textContent();
  const lastEventId = lastEventIdFromFunction?.replace('Event ID from lastEventId(): ', '');

  expect(returnedEventId).toBeDefined();
  expect(returnedEventId).not.toBe('No event ID');
  expect(lastEventId).toBeDefined();
  expect(lastEventId).not.toBe('No event ID');

  expect(lastEventId).toBe(returnedEventId);
  expect(errorEvent.event_id).toBe(returnedEventId);
  expect(errorEvent.event_id).toBe(lastEventId);
});
