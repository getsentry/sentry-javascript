import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends a pageload span with a parameterized URL', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('angular-22', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  await page.goto(`/`);

  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan).toMatchObject({
    name: '/home/',
    is_segment: true,
    attributes: {
      'sentry.op': { type: 'string', value: 'pageload' },
      'sentry.origin': { type: 'string', value: 'auto.pageload.angular' },
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'url.template': { type: 'string', value: '/home/' },
      'url.path': { type: 'string', value: '/home' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/home$/) },
    },
  });
});

test('sends a navigation span with a parameterized URL', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('angular-22', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  const navigationSpanPromise = waitForStreamedSpan('angular-22', span => {
    return span.is_segment && getSpanOp(span) === 'navigation';
  });

  await page.goto(`/`);
  await pageloadSpanPromise;

  await page.waitForTimeout(5000);

  const [_, navigationSpan] = await Promise.all([page.locator('#navLink').click(), navigationSpanPromise]);

  expect(navigationSpan).toMatchObject({
    name: '/users/:id/',
    is_segment: true,
    attributes: {
      'sentry.op': { type: 'string', value: 'navigation' },
      'sentry.origin': { type: 'string', value: 'auto.navigation.angular' },
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'url.template': { type: 'string', value: '/users/:id/' },
      'url.path': { type: 'string', value: '/users/123' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/users\/123$/) },
    },
  });
});

test('sends a navigation span even if the pageload span is still active', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('angular-22', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  const navigationSpanPromise = waitForStreamedSpan('angular-22', span => {
    return span.is_segment && getSpanOp(span) === 'navigation';
  });

  await page.goto(`/`);

  // immediately navigate to a different route
  const [_, pageloadSpan, navigationSpan] = await Promise.all([
    page.locator('#navLink').click(),
    pageloadSpanPromise,
    navigationSpanPromise,
  ]);

  expect(pageloadSpan).toMatchObject({
    name: '/home/',
    is_segment: true,
    attributes: {
      'sentry.op': { type: 'string', value: 'pageload' },
      'sentry.origin': { type: 'string', value: 'auto.pageload.angular' },
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'url.template': { type: 'string', value: '/home/' },
      'url.path': { type: 'string', value: '/home' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/home$/) },
    },
  });

  expect(navigationSpan).toMatchObject({
    name: '/users/:id/',
    is_segment: true,
    attributes: {
      'sentry.op': { type: 'string', value: 'navigation' },
      'sentry.origin': { type: 'string', value: 'auto.navigation.angular' },
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'url.template': { type: 'string', value: '/users/:id/' },
      'url.path': { type: 'string', value: '/users/123' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/users\/123$/) },
    },
  });
});

test('groups redirects within one navigation root span', async ({ page }) => {
  const spansPromise = collectStreamedSpans('angular-22', spans => {
    const navigationSpan = spans.find(
      span =>
        span.is_segment &&
        getSpanOp(span) === 'navigation' &&
        span.name === '/users/:id/' &&
        span.attributes['url.path']?.value === '/users/456',
    );

    return (
      !!navigationSpan &&
      spans.some(
        span =>
          getSpanOp(span) === 'router' &&
          span.parent_span_id === navigationSpan.span_id &&
          span.attributes['url.full']?.value === '/redirect1',
      )
    );
  });

  await page.goto(`/`);

  // immediately navigate to a different route
  const [_, spans] = await Promise.all([page.locator('#redirectLink').click(), spansPromise]);

  const navigationSpan = spans.find(
    span =>
      span.is_segment &&
      getSpanOp(span) === 'navigation' &&
      span.name === '/users/:id/' &&
      span.attributes['url.path']?.value === '/users/456',
  );

  expect(navigationSpan).toMatchObject({
    name: '/users/:id/',
    is_segment: true,
    attributes: {
      'sentry.op': { type: 'string', value: 'navigation' },
      'sentry.origin': { type: 'string', value: 'auto.navigation.angular' },
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'url.template': { type: 'string', value: '/users/:id/' },
      'url.path': { type: 'string', value: '/users/456' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/users\/456$/) },
    },
  });

  const routingSpan = spans.find(
    span =>
      getSpanOp(span) === 'router' &&
      span.parent_span_id === navigationSpan?.span_id &&
      span.attributes['url.full']?.value === '/redirect1',
  );

  expect(routingSpan).toBeDefined();
  // The routing span starts at NavigationStart with only the raw URL, so under streaming it is named Router.
  expect(routingSpan?.name).toBe('Router');
});

test.describe('finish routing span', () => {
  test('finishes routing span on navigation cancel', async ({ page }) => {
    const spansPromise = collectStreamedSpans('angular-22', spans => {
      const navigationSpan = spans.find(
        span => span.is_segment && getSpanOp(span) === 'navigation' && span.attributes['url.path']?.value === '/cancel',
      );

      return (
        !!navigationSpan &&
        spans.some(span => getSpanOp(span) === 'router' && span.parent_span_id === navigationSpan.span_id)
      );
    });

    await page.goto(`/`);

    // immediately navigate to a different route
    const [_, spans] = await Promise.all([page.locator('#cancelLink').click(), spansPromise]);

    const navigationSpan = spans.find(
      span => span.is_segment && getSpanOp(span) === 'navigation' && span.attributes['url.path']?.value === '/cancel',
    );

    expect(navigationSpan).toMatchObject({
      // Cancelled navigations never hit ResolveEnd, so the segment keeps the streaming fallback name.
      name: 'Navigation',
      is_segment: true,
      attributes: {
        'sentry.op': { type: 'string', value: 'navigation' },
        'sentry.origin': { type: 'string', value: 'auto.navigation.angular' },
        'sentry.segment.name.source': { type: 'string', value: 'url' },
        'url.path': { type: 'string', value: '/cancel' },
        'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/cancel$/) },
        // url.template is not set because the navigation was cancelled before Angular fully resolved the route
      },
    });

    const routingSpan = spans.find(
      span => getSpanOp(span) === 'router' && span.parent_span_id === navigationSpan?.span_id,
    );

    expect(routingSpan).toBeDefined();
    expect(routingSpan?.name).toBe('Router');
  });

  test('finishes routing span on navigation error', async ({ page }) => {
    const spansPromise = collectStreamedSpans('angular-22', spans => {
      const navigationSpan = spans.find(
        span =>
          span.is_segment && getSpanOp(span) === 'navigation' && span.attributes['url.path']?.value === '/non-existent',
      );

      return (
        !!navigationSpan &&
        spans.some(span => getSpanOp(span) === 'router' && span.parent_span_id === navigationSpan.span_id)
      );
    });

    await page.goto(`/`);

    // immediately navigate to a different route
    const [_, spans] = await Promise.all([page.locator('#nonExistentLink').click(), spansPromise]);

    const navigationSpan = spans.find(
      span =>
        span.is_segment && getSpanOp(span) === 'navigation' && span.attributes['url.path']?.value === '/non-existent',
    );

    expect(navigationSpan).toMatchObject({
      // Failed navigations never hit ResolveEnd, so the segment keeps the streaming fallback name.
      name: 'Navigation',
      is_segment: true,
      attributes: {
        'sentry.op': { type: 'string', value: 'navigation' },
        'sentry.origin': { type: 'string', value: 'auto.navigation.angular' },
        'sentry.segment.name.source': { type: 'string', value: 'url' },
        'url.path': { type: 'string', value: '/non-existent' },
        'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/non-existent$/) },
        // url.template is not set because the navigation failed before Angular fully resolved the route
      },
    });

    const routingSpan = spans.find(
      span => getSpanOp(span) === 'router' && span.parent_span_id === navigationSpan?.span_id,
    );

    expect(routingSpan).toBeDefined();
    expect(routingSpan?.name).toBe('Router');
  });
});

test.describe('TraceDirective', () => {
  test('creates a child span with the component name as span name on ngOnInit', async ({ page }) => {
    const spansPromise = collectStreamedSpans('angular-22', spans => {
      return (
        spans.some(
          span =>
            span.is_segment &&
            getSpanOp(span) === 'navigation' &&
            span.attributes['url.path']?.value === '/component-tracking',
        ) &&
        spans.filter(span => span.attributes['sentry.origin']?.value === 'auto.ui.angular.trace_directive').length >= 2
      );
    });

    await page.goto(`/`);

    // immediately navigate to a different route
    const [_, spans] = await Promise.all([page.locator('#componentTracking').click(), spansPromise]);

    const traceDirectiveSpans = spans.filter(
      span => span.attributes['sentry.origin']?.value === 'auto.ui.angular.trace_directive',
    );

    expect(traceDirectiveSpans).toHaveLength(2);
    expect(traceDirectiveSpans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: '<sample-component>', // custom component name passed to trace directive
          attributes: expect.objectContaining({
            'sentry.op': { type: 'string', value: 'ui.mount' },
            'sentry.origin': { type: 'string', value: 'auto.ui.angular.trace_directive' },
          }),
        }),
        expect.objectContaining({
          name: '<app-sample-component>', // fallback selector name
          attributes: expect.objectContaining({
            'sentry.op': { type: 'string', value: 'ui.mount' },
            'sentry.origin': { type: 'string', value: 'auto.ui.angular.trace_directive' },
          }),
        }),
      ]),
    );
  });
});

test.describe('TraceClass Decorator', () => {
  test('adds init span for decorated class', async ({ page }) => {
    const spansPromise = collectStreamedSpans('angular-22', spans => {
      return (
        spans.some(
          span =>
            span.is_segment &&
            getSpanOp(span) === 'navigation' &&
            span.attributes['url.path']?.value === '/component-tracking',
        ) && spans.some(span => span.attributes['sentry.origin']?.value === 'auto.ui.angular.trace_class_decorator')
      );
    });

    await page.goto(`/`);

    // immediately navigate to a different route
    const [_, spans] = await Promise.all([page.locator('#componentTracking').click(), spansPromise]);

    const classDecoratorSpan = spans.find(
      span => span.attributes['sentry.origin']?.value === 'auto.ui.angular.trace_class_decorator',
    );

    expect(classDecoratorSpan).toBeDefined();
    expect(classDecoratorSpan).toEqual(
      expect.objectContaining({
        name: '<ComponentTrackingComponent>',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'ui.mount' },
          'sentry.origin': { type: 'string', value: 'auto.ui.angular.trace_class_decorator' },
        }),
      }),
    );
  });
});

test.describe('TraceMethod Decorator', () => {
  test('adds name to span description of decorated method `ngOnInit`', async ({ page }) => {
    const spansPromise = collectStreamedSpans('angular-22', spans => {
      return (
        spans.some(
          span =>
            span.is_segment &&
            getSpanOp(span) === 'navigation' &&
            span.attributes['url.path']?.value === '/component-tracking',
        ) &&
        spans.some(
          span => getSpanOp(span) === 'function' && span.attributes['code.function.name']?.value === 'ngOnInit',
        )
      );
    });

    await page.goto(`/`);

    // immediately navigate to a different route
    const [_, spans] = await Promise.all([page.locator('#componentTracking').click(), spansPromise]);

    const ngInitSpan = spans.find(
      span => getSpanOp(span) === 'function' && span.attributes['code.function.name']?.value === 'ngOnInit',
    );

    expect(ngInitSpan).toBeDefined();
    expect(ngInitSpan).toEqual(
      expect.objectContaining({
        name: '<ngOnInit>',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'function' },
          'sentry.origin': { type: 'string', value: 'auto.ui.angular.trace_method_decorator' },
          'code.function.name': { type: 'string', value: 'ngOnInit' },
        }),
      }),
    );
  });

  test('adds fallback name to span description of decorated method `ngAfterViewInit`', async ({ page }) => {
    const spansPromise = collectStreamedSpans('angular-22', spans => {
      return (
        spans.some(
          span =>
            span.is_segment &&
            getSpanOp(span) === 'navigation' &&
            span.attributes['url.path']?.value === '/component-tracking',
        ) &&
        spans.some(
          span => getSpanOp(span) === 'function' && span.attributes['code.function.name']?.value === 'ngAfterViewInit',
        )
      );
    });

    await page.goto(`/`);

    // immediately navigate to a different route
    const [_, spans] = await Promise.all([page.locator('#componentTracking').click(), spansPromise]);

    const ngAfterViewInitSpan = spans.find(
      span => getSpanOp(span) === 'function' && span.attributes['code.function.name']?.value === 'ngAfterViewInit',
    );

    expect(ngAfterViewInitSpan).toBeDefined();
    expect(ngAfterViewInitSpan).toEqual(
      expect.objectContaining({
        name: '<unnamed>',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'function' },
          'sentry.origin': { type: 'string', value: 'auto.ui.angular.trace_method_decorator' },
          'code.function.name': { type: 'string', value: 'ngAfterViewInit' },
        }),
      }),
    );
  });
});
