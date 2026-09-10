import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends a pageload span with a parameterized URL', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('ember-embroider', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  await page.goto(`/`);

  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan).toMatchObject({
    name: 'route:index',
    is_segment: true,
    attributes: {
      'sentry.op': { type: 'string', value: 'pageload' },
      'sentry.origin': { type: 'string', value: 'auto.pageload.ember' },
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'url.template': { type: 'string', value: '/' },
      'url.path': { type: 'string', value: '/' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/$/) },
    },
  });
});

test('sends a navigation span with a parameterized URL', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('ember-embroider', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  const navigationSpanPromise = waitForStreamedSpan('ember-embroider', span => {
    return span.is_segment && getSpanOp(span) === 'navigation';
  });

  await page.goto(`/`);
  await pageloadSpanPromise;

  const [_, navigationSpan] = await Promise.all([page.getByText('Tracing').click(), navigationSpanPromise]);

  expect(navigationSpan).toMatchObject({
    name: 'route:tracing',
    is_segment: true,
    attributes: {
      'sentry.op': { type: 'string', value: 'navigation' },
      'sentry.origin': { type: 'string', value: 'auto.navigation.ember' },
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'url.template': { type: 'string', value: '/tracing' },
      'url.path': { type: 'string', value: '/tracing' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/tracing$/) },
    },
  });
});

test('sends a navigation span even if the pageload span is still active', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('ember-embroider', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  const navigationSpanPromise = waitForStreamedSpan('ember-embroider', span => {
    return span.is_segment && getSpanOp(span) === 'navigation';
  });

  await page.goto(`/`);

  // immediately navigate to a different route
  const [_, pageloadSpan, navigationSpan] = await Promise.all([
    page.getByText('Tracing').click(),
    pageloadSpanPromise,
    navigationSpanPromise,
  ]);

  expect(pageloadSpan).toMatchObject({
    name: 'route:index',
    is_segment: true,
    attributes: {
      'sentry.op': { type: 'string', value: 'pageload' },
      'sentry.origin': { type: 'string', value: 'auto.pageload.ember' },
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'url.template': { type: 'string', value: '/' },
      'url.path': { type: 'string', value: '/' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/$/) },
    },
  });

  expect(navigationSpan).toMatchObject({
    name: 'route:tracing',
    is_segment: true,
    attributes: {
      'sentry.op': { type: 'string', value: 'navigation' },
      'sentry.origin': { type: 'string', value: 'auto.navigation.ember' },
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'url.template': { type: 'string', value: '/tracing' },
      'url.path': { type: 'string', value: '/tracing' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/tracing$/) },
    },
  });
});

test('captures correct spans for navigation', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('ember-embroider', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  const spansPromise = collectStreamedSpans('ember-embroider', spans => {
    const navigationSpan = spans.find(
      span => span.is_segment && getSpanOp(span) === 'navigation' && span.name === 'route:slow-loading-route.index',
    );

    return (
      !!navigationSpan &&
      spans.some(span => getSpanOp(span) === 'router' && span.parent_span_id === navigationSpan.span_id) &&
      spans.filter(
        span => getSpanOp(span) === 'function' && span.attributes['code.function.name']?.value === 'beforeModel',
      ).length >= 2 &&
      spans.filter(span => getSpanOp(span) === 'function' && span.attributes['code.function.name']?.value === 'model')
        .length >= 2 &&
      spans.filter(
        span => getSpanOp(span) === 'function' && span.attributes['code.function.name']?.value === 'afterModel',
      ).length >= 2 &&
      spans.filter(span => getSpanOp(span) === 'ui.task' && span.attributes['ember.runloop.queue']?.value === 'render')
        .length > 1
    );
  });

  await page.goto(`/tracing`);
  await pageloadSpanPromise;

  const [_, spans] = await Promise.all([page.getByText('Measure Things!').click(), spansPromise]);

  const navigationSpan = spans.find(
    span => span.is_segment && getSpanOp(span) === 'navigation' && span.name === 'route:slow-loading-route.index',
  );

  expect(navigationSpan).toMatchObject({
    name: 'route:slow-loading-route.index',
    is_segment: true,
    attributes: {
      'sentry.op': { type: 'string', value: 'navigation' },
      'sentry.origin': { type: 'string', value: 'auto.navigation.ember' },
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'url.template': { type: 'string', value: '/slow-loading-route' },
      'url.path': { type: 'string', value: '/slow-loading-route' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/slow-loading-route$/) },
    },
  });

  const transitionSpans = spans.filter(
    span => getSpanOp(span) === 'router' && span.parent_span_id === navigationSpan?.span_id,
  );
  const beforeModelSpans = spans.filter(
    span => getSpanOp(span) === 'function' && span.attributes['code.function.name']?.value === 'beforeModel',
  );
  const modelSpans = spans.filter(
    span => getSpanOp(span) === 'function' && span.attributes['code.function.name']?.value === 'model',
  );
  const afterModelSpans = spans.filter(
    span => getSpanOp(span) === 'function' && span.attributes['code.function.name']?.value === 'afterModel',
  );
  const renderSpans = spans.filter(
    span => getSpanOp(span) === 'ui.task' && span.attributes['ember.runloop.queue']?.value === 'render',
  );

  expect(transitionSpans).toHaveLength(1);
  expect(beforeModelSpans).toHaveLength(2);
  expect(modelSpans).toHaveLength(2);
  expect(afterModelSpans).toHaveLength(2);
  expect(renderSpans.length).toBeGreaterThan(1);

  expect(transitionSpans[0]).toMatchObject({
    name: 'Router',
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'router' },
      'sentry.origin': { type: 'string', value: 'auto.ui.ember' },
    }),
  });

  expect(beforeModelSpans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'slow-loading-route',
        attributes: expect.objectContaining({
          'code.function.name': { type: 'string', value: 'beforeModel' },
          'sentry.op': { type: 'string', value: 'function' },
          'sentry.origin': { type: 'string', value: 'auto.ui.ember' },
        }),
      }),
      expect.objectContaining({
        name: 'slow-loading-route.index',
        attributes: expect.objectContaining({
          'code.function.name': { type: 'string', value: 'beforeModel' },
          'sentry.op': { type: 'string', value: 'function' },
          'sentry.origin': { type: 'string', value: 'auto.ui.ember' },
        }),
      }),
    ]),
  );

  expect(modelSpans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'slow-loading-route',
        attributes: expect.objectContaining({
          'code.function.name': { type: 'string', value: 'model' },
        }),
      }),
      expect.objectContaining({
        name: 'slow-loading-route.index',
        attributes: expect.objectContaining({
          'code.function.name': { type: 'string', value: 'model' },
        }),
      }),
    ]),
  );

  expect(afterModelSpans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'slow-loading-route',
        attributes: expect.objectContaining({
          'code.function.name': { type: 'string', value: 'afterModel' },
        }),
      }),
      expect.objectContaining({
        name: 'slow-loading-route.index',
        attributes: expect.objectContaining({
          'code.function.name': { type: 'string', value: 'afterModel' },
        }),
      }),
    ]),
  );

  expect(renderSpans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'runloop',
        attributes: expect.objectContaining({
          'ember.runloop.queue': { type: 'string', value: 'render' },
          'sentry.op': { type: 'string', value: 'ui.task' },
          'sentry.origin': { type: 'string', value: 'auto.ui.ember' },
        }),
      }),
    ]),
  );
});
