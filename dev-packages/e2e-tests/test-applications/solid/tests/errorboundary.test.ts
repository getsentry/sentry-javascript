import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('captures an exception', async ({ page }) => {
  const errorEventPromise = waitForError('solid', errorEvent => {
    return !errorEvent.type && errorEvent.transaction === '/error-boundary-example';
  });

  const [, errorEvent] = await Promise.all([page.goto('/error-boundary-example'), errorEventPromise]);

  expect(errorEvent).toMatchObject({
    exception: {
      values: [
        {
          type: 'ReferenceError',
          value: 'NonExistentComponent is not defined',
          mechanism: {
            type: 'generic',
            handled: true,
          },
        },
      ],
    },
    transaction: '/error-boundary-example',
  });
});

test('captures a second exception after resetting the boundary', async ({ page }) => {
  const firstErrorEventPromise = waitForError('solid', errorEvent => {
    return !errorEvent.type && errorEvent.transaction === '/error-boundary-example';
  });

  const [, firstErrorEvent] = await Promise.all([page.goto('/error-boundary-example'), firstErrorEventPromise]);

  expect(firstErrorEvent).toMatchObject({
    exception: {
      values: [
        {
          type: 'ReferenceError',
          value: 'NonExistentComponent is not defined',
          mechanism: {
            type: 'generic',
            handled: true,
          },
        },
      ],
    },
    transaction: '/error-boundary-example',
  });

  const secondErrorEventPromise = waitForError('solid', errorEvent => {
    return !errorEvent.type && errorEvent.transaction === '/error-boundary-example';
  });

  const [, secondErrorEvent] = await Promise.all([
    page.locator('#errorBoundaryResetBtn').click(),
    await secondErrorEventPromise,
  ]);

  expect(secondErrorEvent).toMatchObject({
    exception: {
      values: [
        {
          type: 'ReferenceError',
          value: 'NonExistentComponent is not defined',
          mechanism: {
            type: 'generic',
            handled: true,
          },
        },
      ],
    },
    transaction: '/error-boundary-example',
  });
});
