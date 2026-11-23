import { expect, test } from '@playwright/test';
import { getSpanOp, collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';
import { setTestUser, hasUrlPart, childSpans } from './helpers';

test.beforeEach(setTestUser);

test('GQL fetch span is attributed to the correct navigation segment when navigating from index to lazy GQL page', async ({
  page,
}, testInfo) => {
  const pageloadSpansPromise = collectStreamedSpansUntilSegment(
    'react-router-7-lazy-routes',
    span =>
      span.attributes['user.id']?.value === testInfo.testId && getSpanOp(span) === 'pageload' && span.name === '/',
  );

  await page.goto('/');
  const pageloadSpans = await pageloadSpansPromise;

  // Pageload should NOT contain any /api/graphql spans (neither UserAQuery nor UserBQuery)
  const pageloadGqlSpans = childSpans(pageloadSpans).filter(
    span => getSpanOp(span) === 'http.client' && hasUrlPart(span, '/api/graphql'),
  );
  expect(pageloadGqlSpans.length).toBe(0);

  const navigationSpansPromise = collectStreamedSpansUntilSegment(
    'react-router-7-lazy-routes',
    span =>
      span.attributes['user.id']?.value === testInfo.testId &&
      getSpanOp(span) === 'navigation' &&
      span.name === '/lazy-gql-a/fetch',
  );

  // Navigate to lazy GQL page A
  const gqlLink = page.locator('id=navigation-to-gql-a');
  await expect(gqlLink).toBeVisible();
  await gqlLink.click();

  const navigationSpans = await navigationSpansPromise;
  const navigationSegment = navigationSpans.find(
    span => getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/lazy-gql-a/fetch',
  )!;

  // Verify the lazy GQL page rendered
  await expect(page.locator('id=gql-page-a')).toBeVisible();

  // Verify the navigation segment has the correct name
  expect(navigationSegment.name).toBe('/lazy-gql-a/fetch');
  expect(getSpanOp(navigationSegment)).toBe('navigation');

  // Verify the UserAQuery GQL fetch span is inside this navigation segment's trace
  const navChildSpans = childSpans(navigationSpans);
  const userASpans = navChildSpans.filter(span => getSpanOp(span) === 'http.client' && hasUrlPart(span, 'UserAQuery'));
  expect(userASpans.length).toBe(1);

  // Verify NO UserBQuery spans leaked into this trace
  const userBSpans = navChildSpans.filter(span => getSpanOp(span) === 'http.client' && hasUrlPart(span, 'UserBQuery'));
  expect(userBSpans.length).toBe(0);
});

test('GQL fetch spans are attributed to correct navigation segments when navigating between two lazy GQL pages', async ({
  page,
}, testInfo) => {
  await page.goto('/');

  // Navigate to GQL page A
  const firstNavSpansPromise = collectStreamedSpansUntilSegment(
    'react-router-7-lazy-routes',
    span =>
      span.attributes['user.id']?.value === testInfo.testId &&
      getSpanOp(span) === 'navigation' &&
      span.name === '/lazy-gql-a/fetch',
  );

  const gqlALink = page.locator('id=navigation-to-gql-a');
  await expect(gqlALink).toBeVisible();
  await gqlALink.click();

  const firstNavSpans = await firstNavSpansPromise;
  const firstNavSegment = firstNavSpans.find(
    span => getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/lazy-gql-a/fetch',
  )!;
  await expect(page.locator('id=gql-page-a')).toBeVisible();

  // First navigation should have exactly the UserAQuery span
  const firstNavChildSpans = childSpans(firstNavSpans);
  const firstUserASpans = firstNavChildSpans.filter(
    span => getSpanOp(span) === 'http.client' && hasUrlPart(span, 'UserAQuery'),
  );
  expect(firstUserASpans.length).toBe(1);

  // First navigation must NOT contain UserBQuery spans
  const firstUserBSpans = firstNavChildSpans.filter(
    span => getSpanOp(span) === 'http.client' && hasUrlPart(span, 'UserBQuery'),
  );
  expect(firstUserBSpans.length).toBe(0);

  // Now navigate from GQL page A to GQL page B
  const secondNavSpansPromise = collectStreamedSpansUntilSegment(
    'react-router-7-lazy-routes',
    span =>
      span.attributes['user.id']?.value === testInfo.testId &&
      getSpanOp(span) === 'navigation' &&
      span.name === '/lazy-gql-b/fetch',
  );

  const gqlBLink = page.locator('id=navigate-to-gql-b');
  await expect(gqlBLink).toBeVisible();
  await gqlBLink.click();

  const secondNavSpans = await secondNavSpansPromise;
  const secondNavSegment = secondNavSpans.find(
    span => getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/lazy-gql-b/fetch',
  )!;
  await expect(page.locator('id=gql-page-b')).toBeVisible();

  // Second navigation should have exactly the UserBQuery span
  const secondNavChildSpans = childSpans(secondNavSpans);
  const secondUserBSpans = secondNavChildSpans.filter(
    span => getSpanOp(span) === 'http.client' && hasUrlPart(span, 'UserBQuery'),
  );
  expect(secondUserBSpans.length).toBe(1);

  // Second navigation must NOT contain UserAQuery spans (no leaking from first nav)
  const secondUserASpans = secondNavChildSpans.filter(
    span => getSpanOp(span) === 'http.client' && hasUrlPart(span, 'UserAQuery'),
  );
  expect(secondUserASpans.length).toBe(0);

  // Verify the two segments have different trace IDs
  expect(firstNavSegment.trace_id).toBeDefined();
  expect(secondNavSegment.trace_id).toBeDefined();
  expect(firstNavSegment.trace_id).not.toBe(secondNavSegment.trace_id);
});
