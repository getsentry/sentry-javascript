import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends an error', async ({ page }) => {
  const errorPromise = waitForError('ember-embroider', async errorEvent => {
    return !errorEvent.type;
  });

  await page.goto(`/`);

  await page.locator('[data-test-button="Throw Generic Javascript Error"]').click();

  const error = await errorPromise;

  expect(error).toMatchObject({
    exception: {
      values: [
        {
          type: 'TypeError',
          value: 'this.nonExistentFunction is not a function',
          mechanism: {
            type: 'auto.browser.browserapierrors.addEventListener',
            handled: false,
          },
        },
      ],
    },
    transaction: 'route:index',
  });
});

test('assigns the correct transaction value after a navigation', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('ember-embroider', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  const errorPromise = waitForError('ember-embroider', async errorEvent => {
    return !errorEvent.type;
  });

  await page.goto(`/tracing`);
  await pageloadSpanPromise;

  await page.getByText('Errors').click();

  const [_, error] = await Promise.all([
    page.locator('[data-test-button="Throw Generic Javascript Error"]').click(),
    errorPromise,
  ]);

  expect(error).toMatchObject({
    exception: {
      values: [
        {
          type: 'TypeError',
          value: 'this.nonExistentFunction is not a function',
          mechanism: {
            type: 'auto.browser.browserapierrors.addEventListener',
            handled: false,
          },
        },
      ],
    },
    transaction: 'route:index',
  });
});
