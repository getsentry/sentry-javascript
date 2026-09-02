import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

const packageJson = require('../package.json');

test('Sends a pageload span', async ({ page }) => {
  const nextjsVersion = packageJson.dependencies.next;
  const nextjsMajor = Number(nextjsVersion.split('.')[0]);

  const pageloadSpanPromise = waitForStreamedSpan('nextjs-pages-dir', span => {
    return getSpanOp(span) === 'pageload' && span.name === '/' && span.is_segment;
  });

  await page.goto('/');

  const span = await pageloadSpanPromise;

  // Next.js >= 15 propagates a trace ID to the client via a meta tag. Also, only dev mode emits a meta tag because
  // the requested page is static and only in dev mode SSR is kicked off.
  if (nextjsMajor >= 15 && isDevMode) {
    expect(span.parent_span_id).toEqual(expect.any(String));
  } else {
    expect(span.parent_span_id).toBeUndefined();
  }

  expect(span.span_id).toEqual(expect.stringMatching(/[a-f0-9]{16}/));
  expect(span.trace_id).toEqual(expect.stringMatching(/[a-f0-9]{32}/));
  expect(span.status).toBe('ok');
  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.nextjs.pages_router_instrumentation', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.template': { value: '/', type: 'string' },
    'react.version': { value: expect.any(String), type: 'string' },
    'http.request.header.user_agent': { value: expect.any(String), type: 'string' },
  });
  expect(String(span.attributes['url.full']?.value)).toMatch(/^https?:\/\/localhost:\d+\/$/);
});

test('Sends a navigation span', async ({ page }) => {
  // Skip in dev mode - flaky due to slow compilation affecting span timing
  test.skip(isDevMode, 'Skipped in dev mode due to flakiness from slow compilation');

  await page.goto('/');

  const clientNavigationSpanPromise = waitForStreamedSpan('nextjs-pages-dir', span => {
    return getSpanOp(span) === 'navigation' && span.name === '/user/[id]' && span.is_segment;
  });

  await page.getByText('navigate').click();

  const span = await clientNavigationSpanPromise;

  expect(span.span_id).toEqual(expect.stringMatching(/[a-f0-9]{16}/));
  expect(span.trace_id).toEqual(expect.stringMatching(/[a-f0-9]{32}/));
  expect(span.status).toBe('ok');
  expect(span.attributes).toMatchObject({
    'sentry.idle_span_finish_reason': { value: 'idleTimeout', type: 'string' },
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.nextjs.pages_router_instrumentation', type: 'string' },
    'sentry.sample_rate': { value: 1, type: 'integer' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.path': { value: '/user/5', type: 'string' },
    'url.template': { value: '/user/[id]', type: 'string' },
    'react.version': { value: expect.any(String), type: 'string' },
    'http.request.header.user_agent': { value: expect.any(String), type: 'string' },
  });
  expect(String(span.attributes['url.full']?.value)).toMatch(/^https?:\/\/localhost:\d+\/user\/5$/);

  expect(span.links).toEqual([
    expect.objectContaining({
      attributes: expect.objectContaining({
        'sentry.link.type': { value: 'previous_trace', type: 'string' },
      }),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    }),
  ]);
});
