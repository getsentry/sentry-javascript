import { expect, test } from '@playwright/test';
import {
  collectStreamedSpans,
  collectStreamedSpansUntilSegment,
  getSpanOp,
  waitForError,
  waitForStreamedSpan,
} from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

const packageJson = require('../package.json');

test('Sends a pageload span', async ({ page }) => {
  const nextjsVersion = packageJson.dependencies.next;
  const nextjsMajor = Number(nextjsVersion.split('.')[0]);

  const pageloadSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
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
    'sentry.origin': { value: 'auto.pageload.nextjs.app_router_instrumentation', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.template': { value: '/', type: 'string' },
    'react.version': { value: expect.any(String), type: 'string' },
    'http.request.header.user_agent': { value: expect.any(String), type: 'string' },
  });
  expect(String(span.attributes['url.full']?.value)).toMatch(/^https?:\/\/localhost:\d+\/$/);
});

test('Should send a span for instrumented server actions', async ({ page }) => {
  const nextjsVersion = packageJson.dependencies.next;
  const nextjsMajor = Number(nextjsVersion.split('.')[0]);
  test.skip(!isNaN(nextjsMajor) && nextjsMajor < 14, 'only applies to nextjs apps >= version 14');

  const serverActionSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
    return span.name === 'serverAction/myServerAction' && span.is_segment;
  });

  await page.goto('/server-action');
  await page.getByText('Run Action').click();

  const span = await serverActionSpanPromise;

  expect(span).toBeDefined();
});

test('Should send a wrapped server action as a child of a nextjs span', async ({ page }) => {
  const nextjsVersion = packageJson.dependencies.next;
  const nextjsMajor = Number(nextjsVersion.split('.')[0]);

  test.skip(!isNaN(nextjsMajor) && nextjsMajor < 14, 'only applies to nextjs apps >= version 14');
  test.skip(isDevMode, 'this magically only works in production');

  // Both spans must come from the same trace. Other specs on this page produce identically shaped
  // `POST /server-action` and `serverAction/myServerAction` spans, so requiring both within one
  // `collectStreamedSpans` - which evaluates a single trace at a time - keeps them paired.
  const spansPromise = collectStreamedSpans('nextjs-app-dir', spans => {
    return (
      spans.some(
        span =>
          span.name === 'POST /server-action' && span.is_segment && span.attributes['sentry.origin']?.value === 'auto',
      ) && spans.some(span => span.name === 'serverAction/myServerAction' && span.is_segment)
    );
  });

  await page.goto('/server-action');
  await page.getByText('Run Action').click();

  const spans = await spansPromise;
  const nextjsSpan = spans.find(
    span =>
      span.name === 'POST /server-action' && span.is_segment && span.attributes['sentry.origin']?.value === 'auto',
  )!;
  const serverActionSpan = spans.find(span => span.name === 'serverAction/myServerAction' && span.is_segment)!;

  expect(nextjsSpan).toBeDefined();
  expect(serverActionSpan).toBeDefined();

  expect(nextjsSpan.span_id).toBe(serverActionSpan.parent_span_id);
});

test('Should set not_found status for server actions calling notFound()', async ({ page }) => {
  const nextjsVersion = packageJson.dependencies.next;
  const nextjsMajor = Number(nextjsVersion.split('.')[0]);
  test.skip(!isNaN(nextjsMajor) && nextjsMajor < 14, 'only applies to nextjs apps >= version 14');

  const serverActionSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
    return span.name === 'serverAction/notFoundServerAction' && span.is_segment;
  });

  await page.goto('/server-action');
  await page.getByText('Run NotFound Action').click();

  const span = await serverActionSpanPromise;

  expect(span).toBeDefined();
  expect(span.attributes['sentry.status.message']?.value).toBe('not_found');
});

test('Should not capture "NEXT_REDIRECT" control-flow errors for server actions calling redirect()', async ({
  page,
}) => {
  const nextjsVersion = packageJson.dependencies.next;
  const nextjsMajor = Number(nextjsVersion.split('.')[0]);
  test.skip(!isNaN(nextjsMajor) && nextjsMajor < 14, 'only applies to nextjs apps >= version 14');

  const serverActionSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
    return span.name === 'serverAction/redirectServerAction' && span.is_segment;
  });

  let controlFlowErrorCaptured = false;
  void waitForError('nextjs-app-dir', errorEvent => {
    if (errorEvent.exception?.values?.[0].value === 'NEXT_REDIRECT') {
      controlFlowErrorCaptured = true;
    }

    return false;
  });

  await page.goto('/server-action');
  await page.getByText('Run Redirect Action').click();

  const serverActionSpan = await serverActionSpanPromise;
  expect(serverActionSpan).toBeDefined();

  // Redirects are normal control flow, so the span must not be flagged as errored
  expect(serverActionSpan.status).toBe('ok');

  // By the time the server action span finishes the error should already have been sent
  expect(controlFlowErrorCaptured).toBe(false);
});

test('Will not include spans with faulty timestamps for slow loading pages', async ({ page }) => {
  test.slow();

  const spansPromise = collectStreamedSpansUntilSegment(
    'nextjs-app-dir',
    span => span.name === '/very-slow-component' && getSpanOp(span) === 'pageload',
  );

  await page.goto('/very-slow-component', { timeout: 11000 });

  const spans = await spansPromise;

  expect(spans.filter(span => span.end_timestamp < span.start_timestamp)).toHaveLength(0);
});
