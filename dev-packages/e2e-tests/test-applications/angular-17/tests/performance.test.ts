import { expect, test } from '@playwright/test';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
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

    const nonExistentRoute = '/non-existent';

    expect(navigationTxn).toMatchObject({
      contexts: {
        trace: {
          op: 'navigation',
          origin: 'auto.navigation.angular',
        },
      },
      transaction: nonExistentRoute,
      transaction_info: {
        source: 'url',
      },
    });

    const routingSpan = navigationTxn.spans?.find(span => span.op === 'ui.angular.routing');

    expect(routingSpan).toBeDefined();
    expect(routingSpan?.description).toBe(nonExistentRoute);
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

    const traceDirectiveSpan = navigationTxn.spans?.find(
      span => span?.data && span?.data[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] === 'auto.ui.angular.trace_directive',
    );

    expect(traceDirectiveSpan).toBeDefined();
    expect(traceDirectiveSpan).toEqual(
      expect.objectContaining({
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'ui.angular.init',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.angular.trace_directive',
        },
        description: '<sample-component>',
        op: 'ui.angular.init',
        origin: 'auto.ui.angular.trace_directive',
        start_timestamp: expect.any(Number),
        timestamp: expect.any(Number),
      }),
    );
  });
});

test.describe('TraceClass Decorator', () => {
  test('adds init span for decorated class', async ({ page }) => {
    const navigationTxnPromise = waitForTransaction('angular-17', async transactionEvent => {
      return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
    });

    await page.goto(`/`);

    // immediately navigate to a different route
    const [_, navigationTxn] = await Promise.all([page.locator('#componentTracking').click(), navigationTxnPromise]);

    const classDecoratorSpan = navigationTxn.spans?.find(
      span => span?.data && span?.data[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] === 'auto.ui.angular.trace_class_decorator',
    );

    expect(classDecoratorSpan).toBeDefined();
    expect(classDecoratorSpan).toEqual(
      expect.objectContaining({
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'ui.angular.init',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.angular.trace_class_decorator',
        },
        description: '<ComponentTrackingComponent>',
        op: 'ui.angular.init',
        origin: 'auto.ui.angular.trace_class_decorator',
        start_timestamp: expect.any(Number),
        timestamp: expect.any(Number),
      }),
    );
  });
});

test.describe('TraceMethod Decorator', () => {
  test('adds name to span description of decorated method `ngOnInit`', async ({ page }) => {
    const navigationTxnPromise = waitForTransaction('angular-17', async transactionEvent => {
      return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
    });

    await page.goto(`/`);

    // immediately navigate to a different route
    const [_, navigationTxn] = await Promise.all([page.locator('#componentTracking').click(), navigationTxnPromise]);

    const ngInitSpan = navigationTxn.spans?.find(span => span.op === 'ui.angular.ngOnInit');

    expect(ngInitSpan).toBeDefined();
    expect(ngInitSpan).toEqual(
      expect.objectContaining({
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'ui.angular.ngOnInit',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.angular.trace_method_decorator',
        },
        description: '<ngOnInit>',
        op: 'ui.angular.ngOnInit',
        origin: 'auto.ui.angular.trace_method_decorator',
        start_timestamp: expect.any(Number),
        timestamp: expect.any(Number),
      }),
    );
  });

  test('adds fallback name to span description of decorated method `ngAfterViewInit`', async ({ page }) => {
    const navigationTxnPromise = waitForTransaction('angular-17', async transactionEvent => {
      return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
    });

    await page.goto(`/`);

    // immediately navigate to a different route
    const [_, navigationTxn] = await Promise.all([page.locator('#componentTracking').click(), navigationTxnPromise]);

    const ngAfterViewInitSpan = navigationTxn.spans?.find(span => span.op === 'ui.angular.ngAfterViewInit');

    expect(ngAfterViewInitSpan).toBeDefined();
    expect(ngAfterViewInitSpan).toEqual(
      expect.objectContaining({
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'ui.angular.ngAfterViewInit',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.angular.trace_method_decorator',
        },
        description: '<unnamed>',
        op: 'ui.angular.ngAfterViewInit',
        origin: 'auto.ui.angular.trace_method_decorator',
        start_timestamp: expect.any(Number),
        timestamp: expect.any(Number),
      }),
    );
  });
});
