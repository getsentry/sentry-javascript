import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('captures transaction', async ({ page }) => {
  const transactionPromise = waitForTransaction('ember-6', transactionEvent => {
    return transactionEvent.transaction === 'route:tracing';
  });
  await page.goto('/tracing');

  const transaction = await transactionPromise;
  expect(transaction).toMatchObject({
    transaction: 'route:tracing',
    contexts: {
      trace: {
        data: {
          toRoute: 'tracing',
        },
      },
    },
    type: 'transaction',
    spans: expect.any(Array),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
  });

  expect(transaction.spans).toContainEqual(
    expect.objectContaining({
      op: 'ui.ember.transition',
      description: 'route:undefined -> route:tracing',
    }),
  );
});

test('handles slow loading route', async ({ page }) => {
  const transactionPromise = waitForTransaction('ember-6', transactionEvent => {
    return transactionEvent.transaction === 'route:slow-loading-route.index';
  });
  await page.goto('/tracing');
  await page.locator('[data-test-button="Transition to slow loading route"]').click();

  const transaction = await transactionPromise;
  expect(transaction).toMatchObject({
    transaction: 'route:slow-loading-route.index',
    contexts: {
      trace: {
        data: {
          fromRoute: 'tracing',
          toRoute: 'slow-loading-route.index',
        },
      },
    },
  });
  expect(transaction.spans).toContainEqual(
    expect.objectContaining({
      op: 'ui.ember.transition',
      description: 'route:tracing -> route:slow-loading-route.index',
    }),
  );
  expect(transaction.spans).toContainEqual(
    expect.objectContaining({
      op: 'ui.ember.route.before_model',
      description: 'slow-loading-route',
    }),
  );
  expect(transaction.spans).toContainEqual(
    expect.objectContaining({
      op: 'ui.ember.route.before_model',
      description: 'slow-loading-route.index',
    }),
  );
  expect(transaction.spans).toContainEqual(
    expect.objectContaining({
      op: 'ui.ember.route.model',
      description: 'slow-loading-route.index',
    }),
  );
  expect(transaction.spans).toContainEqual(
    expect.objectContaining({
      op: 'ui.ember.route.model',
      description: 'slow-loading-route',
    }),
  );
  expect(transaction.spans).toContainEqual(
    expect.objectContaining({
      op: 'ui.ember.route.after_model',
      description: 'slow-loading-route',
    }),
  );
  expect(transaction.spans).toContainEqual(
    expect.objectContaining({
      op: 'ui.ember.route.after_model',
      description: 'slow-loading-route.index',
    }),
  );
  expect(transaction.spans).toContainEqual(
    expect.objectContaining({
      op: 'ui.ember.route.setup_controller',
      description: 'slow-loading-route',
    }),
  );
  expect(transaction.spans).toContainEqual(
    expect.objectContaining({
      op: 'ui.ember.route.setup_controller',
      description: 'slow-loading-route.index',
    }),
  );
});

test('handles page with loading state', async ({ page }) => {
  const transactionPromise = waitForTransaction('ember-6', transactionEvent => {
    return transactionEvent.transaction === 'route:with-loading.index';
  });
  await page.goto('/with-loading');

  const transaction = await transactionPromise;
  expect(transaction).toMatchObject({
    transaction: 'route:with-loading.index',
    contexts: {
      trace: {
        data: {
          toRoute: 'with-loading.index',
        },
      },
    },
  });
});

test('handles page with error state', async ({ page }) => {
  // The route's model hook intentionally throws, so we need to handle errors
  const transactionPromise = waitForTransaction('ember-6', transactionEvent => {
    return transactionEvent.transaction === 'route:with-error.index';
  });
  await page.goto('/with-error');

  const transaction = await transactionPromise;
  expect(transaction).toMatchObject({
    transaction: 'route:with-error.index',
    contexts: {
      trace: {
        data: {
          toRoute: 'with-error.index',
        },
      },
    },
  });
});
