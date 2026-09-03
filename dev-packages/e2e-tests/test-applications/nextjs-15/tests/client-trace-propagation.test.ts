import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { parseSemver } from '@sentry/core';

const packageJson = require('../package.json');
const nextjsVersion = packageJson.dependencies.next;
const { major, minor } = parseSemver(nextjsVersion);

test('Should propagate traces from server to client in pages router', async ({ page }) => {
  test.skip(
    major === 15 && minor !== undefined && minor < 3,
    'Next.js version does not support clientside instrumentation',
  );

  const serverSpanPromise = waitForStreamedSpan('nextjs-15', span => {
    return span.name === 'GET /[locale]/pages-router-client-trace-propagation' && span.is_segment;
  });

  const pageloadSpanPromise = waitForStreamedSpan('nextjs-15', span => {
    return (
      span.name === '/[locale]/pages-router-client-trace-propagation' &&
      getSpanOp(span) === 'pageload' &&
      span.is_segment
    );
  });

  await page.goto(`/123/pages-router-client-trace-propagation`);

  const serverSpan = await serverSpanPromise;
  const pageloadSpan = await pageloadSpanPromise;

  expect(serverSpan.trace_id).toBeDefined();
  expect(pageloadSpan.trace_id).toBe(serverSpan.trace_id);

  await test.step('release was successfully injected on the serverside', () => {
    // Release as defined in next.config.js
    expect(serverSpan.attributes['sentry.release']?.value).toBe('foobar123');
  });

  await test.step('release was successfully injected on the clientside', () => {
    // Release as defined in next.config.js
    expect(pageloadSpan.attributes['sentry.release']?.value).toBe('foobar123');
  });
});
