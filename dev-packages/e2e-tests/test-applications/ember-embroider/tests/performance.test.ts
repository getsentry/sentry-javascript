import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('sends a pageload transaction with a parameterized URL', async ({ page }) => {
  const transactionPromise = waitForTransaction('ember-embroider', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/`);

  const rootSpan = await transactionPromise;

  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.ember',
      },
    },
    transaction: 'route:index',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a navigation transaction with a parameterized URL', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('ember-embroider', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTxnPromise = waitForTransaction('ember-embroider', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/`);
  await pageloadTxnPromise;

  const [_, navigationTxn] = await Promise.all([page.getByText('Tracing').click(), navigationTxnPromise]);

  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.ember',
      },
    },
    transaction: 'route:tracing',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a navigation transaction even if the pageload span is still active', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('ember-embroider', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTxnPromise = waitForTransaction('ember-embroider', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/`);

  // immediately navigate to a different route
  const [_, pageloadTxn, navigationTxn] = await Promise.all([
    page.getByText('Tracing').click(),
    pageloadTxnPromise,
    navigationTxnPromise,
  ]);

  expect(pageloadTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.ember',
      },
    },
    transaction: 'route:index',
    transaction_info: {
      source: 'route',
    },
  });

  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.ember',
      },
    },
    transaction: 'route:tracing',
    transaction_info: {
      source: 'route',
    },
  });
});

test('captures correct spans for navigation', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('ember-embroider', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTxnPromise = waitForTransaction('ember-embroider', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/tracing`);
  await pageloadTxnPromise;

  const [_, navigationTxn] = await Promise.all([page.getByText('Measure Things!').click(), navigationTxnPromise]);

  const traceId = navigationTxn.contexts?.trace?.trace_id;
  const spanId = navigationTxn.contexts?.trace?.span_id;

  expect(traceId).toBeDefined();
  expect(spanId).toBeDefined();

  const spans = navigationTxn.spans || [];

  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.ember',
      },
    },
    transaction: 'route:slow-loading-route.index',
    transaction_info: {
      source: 'route',
    },
  });

  const transitionSpans = spans.filter(span => span.op === 'ui.ember.transition');
  const beforeModelSpans = spans.filter(span => span.op === 'ui.ember.route.before_model');
  const modelSpans = spans.filter(span => span.op === 'ui.ember.route.model');
  const afterModelSpans = spans.filter(span => span.op === 'ui.ember.route.after_model');
  const renderSpans = spans.filter(span => span.op === 'ui.ember.runloop.render');

  expect(transitionSpans).toHaveLength(1);

  // We have two spans each there - one for `slow-loading-route` and one for `slow-load-route.index`
  expect(beforeModelSpans).toHaveLength(2);
  expect(modelSpans).toHaveLength(2);
  expect(afterModelSpans).toHaveLength(2);

  // There may be many render spans...
  expect(renderSpans.length).toBeGreaterThan(1);

  expect(transitionSpans[0]).toEqual({
    data: {
      'sentry.op': 'ui.ember.transition',
      'sentry.origin': 'auto.ui.ember',
    },
    description: 'route:tracing -> route:slow-loading-route.index',
    op: 'ui.ember.transition',
    origin: 'auto.ui.ember',
    parent_span_id: spanId,
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: traceId,
  });

  expect(beforeModelSpans).toEqual([
    {
      data: {
        'sentry.op': 'ui.ember.route.before_model',
        'sentry.origin': 'auto.ui.ember',
        'sentry.source': 'custom',
      },
      description: 'slow-loading-route',
      op: 'ui.ember.route.before_model',
      origin: 'auto.ui.ember',
      parent_span_id: spanId,
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: traceId,
    },
    {
      data: {
        'sentry.op': 'ui.ember.route.before_model',
        'sentry.origin': 'auto.ui.ember',
        'sentry.source': 'custom',
      },
      description: 'slow-loading-route.index',
      op: 'ui.ember.route.before_model',
      origin: 'auto.ui.ember',
      parent_span_id: spanId,
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: traceId,
    },
  ]);

  expect(modelSpans).toEqual([
    {
      data: {
        'sentry.op': 'ui.ember.route.model',
        'sentry.origin': 'auto.ui.ember',
        'sentry.source': 'custom',
      },
      description: 'slow-loading-route',
      op: 'ui.ember.route.model',
      origin: 'auto.ui.ember',
      parent_span_id: spanId,
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: traceId,
    },
    {
      data: {
        'sentry.op': 'ui.ember.route.model',
        'sentry.origin': 'auto.ui.ember',
        'sentry.source': 'custom',
      },
      description: 'slow-loading-route.index',
      op: 'ui.ember.route.model',
      origin: 'auto.ui.ember',
      parent_span_id: spanId,
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: traceId,
    },
  ]);

  expect(afterModelSpans).toEqual([
    {
      data: {
        'sentry.op': 'ui.ember.route.after_model',
        'sentry.origin': 'auto.ui.ember',
        'sentry.source': 'custom',
      },
      description: 'slow-loading-route',
      op: 'ui.ember.route.after_model',
      origin: 'auto.ui.ember',
      parent_span_id: spanId,
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: traceId,
    },
    {
      data: {
        'sentry.op': 'ui.ember.route.after_model',
        'sentry.origin': 'auto.ui.ember',
        'sentry.source': 'custom',
      },
      description: 'slow-loading-route.index',
      op: 'ui.ember.route.after_model',
      origin: 'auto.ui.ember',
      parent_span_id: spanId,
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: traceId,
    },
  ]);

  expect(renderSpans).toContainEqual({
    data: {
      'sentry.op': 'ui.ember.runloop.render',
      'sentry.origin': 'auto.ui.ember',
    },
    description: 'runloop',
    op: 'ui.ember.runloop.render',
    origin: 'auto.ui.ember',
    parent_span_id: spanId,
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: traceId,
  });
});
