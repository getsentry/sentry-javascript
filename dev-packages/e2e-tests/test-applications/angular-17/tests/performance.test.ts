import { expect, test } from '@playwright/test';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/browser';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP } from '@sentry/core/src';
import { waitForTransaction } from '../event-proxy-server';

test('sends a pageload transaction with a parameterized URL', async ({ page }) => {
  const transactionPromise = waitForTransaction('angular-17', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/`);

  const rootSpan = await transactionPromise;

  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.angular',
      },
    },
    transaction: '/home/',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a navigation transaction with a parameterized URL', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('angular-17', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTxnPromise = waitForTransaction('angular-17', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/`);
  await pageloadTxnPromise;

  await page.waitForTimeout(5000);

  const [_, navigationTxn] = await Promise.all([page.locator('#navLink').click(), navigationTxnPromise]);

  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
      },
    },
    transaction: '/users/:id/',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a navigation transaction even if the pageload span is still active', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('angular-17', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTxnPromise = waitForTransaction('angular-17', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/`);

  // immediately navigate to a different route
  const [_, pageloadTxn, navigationTxn] = await Promise.all([
    page.locator('#navLink').click(),
    pageloadTxnPromise,
    navigationTxnPromise,
  ]);

  expect(pageloadTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.angular',
      },
    },
    transaction: '/home/',
    transaction_info: {
      source: 'route',
    },
  });

  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.angular',
      },
    },
    transaction: '/users/:id/',
    transaction_info: {
      source: 'route',
    },
  });
});

test('groups redirects within one navigation root span', async ({ page }) => {
  const navigationTxnPromise = waitForTransaction('angular-17', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/`);

  // immediately navigate to a different route
  const [_, navigationTxn] = await Promise.all([page.locator('#redirectLink').click(), navigationTxnPromise]);

  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.angular',
      },
    },
    transaction: '/users/:id/',
    transaction_info: {
      source: 'route',
    },
  });

  const routingSpan = navigationTxn.spans?.find(span => span.op === 'ui.angular.routing');

  expect(routingSpan).toBeDefined();
  expect(routingSpan?.description).toBe('/redirect1');
});

test.describe('finish routing span', () => {
  test('finishes routing span on navigation cancel', async ({ page }) => {
    const navigationTxnPromise = waitForTransaction('angular-17', async transactionEvent => {
      return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
    });

    await page.goto(`/`);

    // immediately navigate to a different route
    const [_, navigationTxn] = await Promise.all([page.locator('#cancelLink').click(), navigationTxnPromise]);

    expect(navigationTxn).toMatchObject({
      contexts: {
        trace: {
          op: 'navigation',
          origin: 'auto.navigation.angular',
        },
      },
      transaction: '/cancel',
      transaction_info: {
        source: 'url',
      },
    });

    const routingSpan = navigationTxn.spans?.find(span => span.op === 'ui.angular.routing');

    expect(routingSpan).toBeDefined();
    expect(routingSpan?.description).toBe('/cancel');
  });

  test('finishes routing span on navigation error', async ({ page }) => {
    const navigationTxnPromise = waitForTransaction('angular-17', async transactionEvent => {
      return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
    });

    await page.goto(`/`);

    // immediately navigate to a different route
    const [_, navigationTxn] = await Promise.all([page.locator('#nonExistentLink').click(), navigationTxnPromise]);

    expect(navigationTxn).toMatchObject({
      contexts: {
        trace: {
          op: 'navigation',
          origin: 'auto.navigation.angular',
        },
      },
      transaction: '/non-existent',
      transaction_info: {
        source: 'url',
      },
    });

    const routingSpan = navigationTxn.spans?.find(span => span.op === 'ui.angular.routing');

    expect(routingSpan).toBeDefined();
    expect(routingSpan?.description).toBe('/nonExistentLink');
  });
});

test.describe('TraceDirective', () => {
  test('creates a child tracingSpan with component name as span name on ngOnInit', async ({ page }) => {
    const navigationTxnPromise = waitForTransaction('angular-17', async transactionEvent => {
      return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
    });

    await page.goto(`/`);

    // immediately navigate to a different route
    const [_, navigationTxn] = await Promise.all([page.locator('#componentTracking').click(), navigationTxnPromise]);

    const traceDirectiveSpan = navigationTxn.spans?.find(span => span.op === 'ui.angular.init');

    expect(traceDirectiveSpan).toBeDefined();
    expect(traceDirectiveSpan).toEqual(
      expect.objectContaining({
        description: '<sample-component>',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'ui.angular.init',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.angular.trace_directive',
        },
        op: 'ui.angular.init',
        origin: 'auto.ui.angular.trace_directive',
      }),
    );
  });

  test('finishes tracingSpan after ngAfterViewInit', () => {
    // todo
  });
});

test.describe('TraceClassDecorator', () => {
  test('adds init span for decorated class', async ({ page }) => {
    const navigationTxnPromise = waitForTransaction('angular-17', async transactionEvent => {
      return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
    });

    await page.goto(`/`);

    // immediately navigate to a different route
    const [_, navigationTxn] = await Promise.all([page.locator('#componentTracking').click(), navigationTxnPromise]);

    const initSpan = navigationTxn.spans?.find(span => span.op === 'ui.angular.init');

    expect(initSpan).toBeDefined();
  });
});

test.describe('TraceMethodDecorator', () => {
  test('instruments decorated methods (`ngOnInit` and `ngAfterViewInit`)', async ({ page }) => {
    const navigationTxnPromise = waitForTransaction('angular-17', async transactionEvent => {
      return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
    });

    await page.goto(`/`);

    // immediately navigate to a different route
    const [_, navigationTxn] = await Promise.all([page.locator('#componentTracking').click(), navigationTxnPromise]);

    const ngInitSpan = navigationTxn.spans?.find(span => span.op === 'ui.angular.ngOnInit');
    const ngAfterViewInitSpan = navigationTxn.spans?.find(span => span.op === 'ui.angular.ngAfterViewInit');

    expect(ngInitSpan).toBeDefined();
    expect(ngInitSpan).toEqual(
      expect.objectContaining({
        description: '<ComponentTrackingComponent>',
        op: 'ui.angular.ngOnInit',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'ui.angular.ngOnInit',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.angular.trace_class_decorator',
        },
      }),
    );

    expect(ngAfterViewInitSpan).toBeDefined();
    expect(ngAfterViewInitSpan).toEqual(
      expect.objectContaining({
        description: '<ComponentTrackingComponent>',
        op: 'ui.angular.ngAfterViewInit',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'ui.angular.ngOnInit',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.angular.trace_method_decorator',
        },
        startTimestamp: expect.any(Number),
        endTimestamp: expect.any(Number),
      }),
    );
  });
});
