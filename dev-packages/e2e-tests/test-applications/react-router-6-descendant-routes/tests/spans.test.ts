import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends a pageload span with a parameterized URL', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-router-6-descendant-routes', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/projects/123/views/234/567`);

  const span = await spanPromise;

  expect((await page.innerHTML('#root')).includes('Details')).toBe(true);
  expect(span.name).toBe('/projects/:projectId/views/:viewId/:detailId');
  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.react.reactrouter_v6', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/projects/:projectId/views/:viewId/:detailId', type: 'string' },
    'url.path': { value: '/projects/123/views/234/567', type: 'string' },
    'url.full': {
      value: expect.stringMatching(/^https?:\/\/localhost:\d+\/projects\/123\/views\/234\/567$/),
      type: 'string',
    },
  });
});

test('sends a pageload span with a parameterized URL - alternative route', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-router-6-descendant-routes', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/projects/234/old-views/234/567`);

  const span = await spanPromise;

  expect((await page.innerHTML('#root')).includes('Details')).toBe(true);
  expect(span.name).toBe('/projects/:projectId/old-views/:viewId/:detailId');
  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.react.reactrouter_v6', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/projects/:projectId/old-views/:viewId/:detailId', type: 'string' },
    'url.path': { value: '/projects/234/old-views/234/567', type: 'string' },
    'url.full': {
      value: expect.stringMatching(/^https?:\/\/localhost:\d+\/projects\/234\/old-views\/234\/567$/),
      type: 'string',
    },
  });
});

test('keeps the parent path prefix for a descendant route with non-wildcard nested children - pageload', async ({
  page,
}) => {
  const spanPromise = waitForStreamedSpan('react-router-6-descendant-routes', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/child/abc123`);

  const span = await spanPromise;

  expect((await page.innerHTML('#root')).includes('Child')).toBe(true);
  expect(span.name).toBe('/child/:id');
  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.react.reactrouter_v6', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/child/:id', type: 'string' },
    'url.path': { value: '/child/abc123', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/child\/abc123$/), type: 'string' },
  });
});

test('sends a navigation span with a parameterized URL', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('react-router-6-descendant-routes', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  const navigationSpanPromise = waitForStreamedSpan('react-router-6-descendant-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goto(`/`);
  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan.name).toBe('/');
  expect(pageloadSpan.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.react.reactrouter_v6', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/$/), type: 'string' },
  });

  const linkElement = page.locator('id=navigation');

  const [_, navigationSpan] = await Promise.all([linkElement.click(), navigationSpanPromise]);

  expect((await page.innerHTML('#root')).includes('Details')).toBe(true);
  expect(navigationSpan.name).toBe('/projects/:projectId/views/:viewId/:detailId');
  expect(navigationSpan.attributes).toMatchObject({
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.react.reactrouter_v6', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/projects/:projectId/views/:viewId/:detailId', type: 'string' },
    'url.path': { value: '/projects/123/views/456/789', type: 'string' },
    'url.full': {
      value: expect.stringMatching(/^https?:\/\/localhost:\d+\/projects\/123\/views\/456\/789$/),
      type: 'string',
    },
  });
});

test('sends a navigation span with a parameterized URL - alternative route', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('react-router-6-descendant-routes', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  const navigationSpanPromise = waitForStreamedSpan('react-router-6-descendant-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goto(`/`);
  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan.name).toBe('/');
  expect(pageloadSpan.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.react.reactrouter_v6', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/$/), type: 'string' },
  });

  const linkElement = page.locator('id=old-navigation');

  const [_, navigationSpan] = await Promise.all([linkElement.click(), navigationSpanPromise]);

  expect((await page.innerHTML('#root')).includes('Details')).toBe(true);
  expect(navigationSpan.name).toBe('/projects/:projectId/old-views/:viewId/:detailId');
  expect(navigationSpan.attributes).toMatchObject({
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.react.reactrouter_v6', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/projects/:projectId/old-views/:viewId/:detailId', type: 'string' },
    'url.path': { value: '/projects/123/old-views/345/654', type: 'string' },
    'url.full': {
      value: expect.stringMatching(/^https?:\/\/localhost:\d+\/projects\/123\/old-views\/345\/654$/),
      type: 'string',
    },
  });
});

test('keeps the parent path prefix for a descendant route with non-wildcard nested children - navigation', async ({
  page,
}) => {
  const pageloadSpanPromise = waitForStreamedSpan('react-router-6-descendant-routes', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  const navigationSpanPromise = waitForStreamedSpan('react-router-6-descendant-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goto(`/`);
  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan.name).toBe('/');
  expect(pageloadSpan.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.react.reactrouter_v6', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/$/), type: 'string' },
  });

  const linkElement = page.locator('id=child-navigation');

  const [_, navigationSpan] = await Promise.all([linkElement.click(), navigationSpanPromise]);

  expect((await page.innerHTML('#root')).includes('Child')).toBe(true);
  expect(navigationSpan.name).toBe('/child/:id');
  expect(navigationSpan.attributes).toMatchObject({
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.react.reactrouter_v6', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/child/:id', type: 'string' },
    'url.path': { value: '/child/abc123', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/child\/abc123$/), type: 'string' },
  });
});

test('resolves deep wildcard chain with three levels of nesting - pageload', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-router-6-descendant-routes', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/workspace/team/u123`);

  const span = await spanPromise;

  expect((await page.innerHTML('#root')).includes('Deep Member')).toBe(true);
  expect(span.name).toBe('/workspace/:teamId/:memberId');
  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.react.reactrouter_v6', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/workspace/:teamId/:memberId', type: 'string' },
    'url.path': { value: '/workspace/team/u123', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/workspace\/team\/u123$/), type: 'string' },
  });
});

test('does not mix param names across independent descendant routers', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('react-router-6-descendant-routes', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  const fooNavigationSpanPromise = waitForStreamedSpan('react-router-6-descendant-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.attributes['url.path']?.value === '/foo/123';
  });

  const barNavigationSpanPromise = waitForStreamedSpan('react-router-6-descendant-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.attributes['url.path']?.value === '/bar/456';
  });

  await page.goto(`/`);
  await pageloadSpanPromise;

  // Mount the first descendant router (`foo/*` -> `:fooId`), which populates the shared `allRoutes` set.
  const [, fooNavigationSpan] = await Promise.all([
    page.locator('id=foo-navigation').click(),
    fooNavigationSpanPromise,
  ]);

  expect((await page.innerHTML('#root')).includes('Foo')).toBe(true);
  expect(fooNavigationSpan.name).toBe('/foo/:fooId');
  expect(fooNavigationSpan.attributes['sentry.segment.name.source']?.value).toBe('route');

  // Return to the index so we can navigate into the second, unrelated descendant router client-side.
  // A fresh page load would reset the module-level `allRoutes` and hide the bug.
  await page.goBack();
  await page.locator('id=bar-navigation').waitFor();

  // Now mount the second descendant router (`bar/*` -> `:barId`). With the accumulation bug, the name
  // comes out as the hybrid `/bar/:fooId`.
  const [, barNavigationSpan] = await Promise.all([
    page.locator('id=bar-navigation').click(),
    barNavigationSpanPromise,
  ]);

  expect((await page.innerHTML('#root')).includes('Bar')).toBe(true);
  expect(barNavigationSpan.name).toBe('/bar/:barId');
  expect(barNavigationSpan.attributes).toMatchObject({
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.react.reactrouter_v6', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/bar/:barId', type: 'string' },
    'url.path': { value: '/bar/456', type: 'string' },
  });
});

test('resolves deep wildcard chain with three levels of nesting - navigation', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('react-router-6-descendant-routes', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  const navigationSpanPromise = waitForStreamedSpan('react-router-6-descendant-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goto(`/`);
  await pageloadSpanPromise;

  const linkElement = page.locator('id=deep-member-navigation');

  const [_, navigationSpan] = await Promise.all([linkElement.click(), navigationSpanPromise]);

  expect((await page.innerHTML('#root')).includes('Deep Member')).toBe(true);
  expect(navigationSpan.name).toBe('/workspace/:teamId/:memberId');
  expect(navigationSpan.attributes).toMatchObject({
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.react.reactrouter_v6', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/workspace/:teamId/:memberId', type: 'string' },
    'url.path': { value: '/workspace/team/u123', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/workspace\/team\/u123$/), type: 'string' },
  });
});
