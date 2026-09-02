import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends a pageload span with a parameterized URL', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-router-7-cross-usage', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/projects/123/views/234/567`);

  const span = await spanPromise;

  expect((await page.innerHTML('#root')).includes('Details')).toBe(true);
  expect(span.name).toBe('/projects/:projectId/views/:viewId/:detailId');
  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.react.reactrouter', type: 'string' },
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
  const spanPromise = waitForStreamedSpan('react-router-7-cross-usage', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/projects/234/old-views/234/567`);

  const span = await spanPromise;

  expect((await page.innerHTML('#root')).includes('Details')).toBe(true);
  expect(span.name).toBe('/projects/:projectId/old-views/:viewId/:detailId');
  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.react.reactrouter', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/projects/:projectId/old-views/:viewId/:detailId', type: 'string' },
    'url.path': { value: '/projects/234/old-views/234/567', type: 'string' },
    'url.full': {
      value: expect.stringMatching(/^https?:\/\/localhost:\d+\/projects\/234\/old-views\/234\/567$/),
      type: 'string',
    },
  });
});

test('sends a navigation span with a parameterized URL', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('react-router-7-cross-usage', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  const navigationSpanPromise = waitForStreamedSpan('react-router-7-cross-usage', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goto(`/`);
  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan.name).toBe('/');
  expect(pageloadSpan.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.react.reactrouter', type: 'string' },
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
    'sentry.origin': { value: 'auto.navigation.react.reactrouter', type: 'string' },
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
  const pageloadSpanPromise = waitForStreamedSpan('react-router-7-cross-usage', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  const navigationSpanPromise = waitForStreamedSpan('react-router-7-cross-usage', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goto(`/`);
  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan.name).toBe('/');
  expect(pageloadSpan.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.react.reactrouter', type: 'string' },
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
    'sentry.origin': { value: 'auto.navigation.react.reactrouter', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.template': { value: '/projects/:projectId/old-views/:viewId/:detailId', type: 'string' },
    'url.path': { value: '/projects/123/old-views/345/654', type: 'string' },
    'url.full': {
      value: expect.stringMatching(/^https?:\/\/localhost:\d+\/projects\/123\/old-views\/345\/654$/),
      type: 'string',
    },
  });
});
