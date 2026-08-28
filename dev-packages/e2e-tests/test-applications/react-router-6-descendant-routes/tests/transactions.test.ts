import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('sends a pageload transaction with a parameterized URL', async ({ page }) => {
  const transactionPromise = waitForTransaction('react-router-6-descendant-routes', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/projects/123/views/234/567`);

  const rootSpan = await transactionPromise;

  expect((await page.innerHTML('#root')).includes('Details')).toBe(true);
  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.react.reactrouter_v6',
        data: {
          'sentry.segment.name.source': 'route',
          'url.template': '/projects/:projectId/views/:viewId/:detailId',
          'url.path': '/projects/123/views/234/567',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/projects\/123\/views\/234\/567$/),
        },
      },
    },
    transaction: '/projects/:projectId/views/:viewId/:detailId',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a pageload transaction with a parameterized URL - alternative route', async ({ page }) => {
  const transactionPromise = waitForTransaction('react-router-6-descendant-routes', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/projects/234/old-views/234/567`);

  const rootSpan = await transactionPromise;

  expect((await page.innerHTML('#root')).includes('Details')).toBe(true);
  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.react.reactrouter_v6',
        data: {
          'sentry.segment.name.source': 'route',
          'url.template': '/projects/:projectId/old-views/:viewId/:detailId',
          'url.path': '/projects/234/old-views/234/567',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/projects\/234\/old-views\/234\/567$/),
        },
      },
    },
    transaction: '/projects/:projectId/old-views/:viewId/:detailId',
    transaction_info: {
      source: 'route',
    },
  });
});

test('keeps the parent path prefix for a descendant route with non-wildcard nested children - pageload', async ({
  page,
}) => {
  const transactionPromise = waitForTransaction('react-router-6-descendant-routes', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/child/abc123`);

  const rootSpan = await transactionPromise;

  expect((await page.innerHTML('#root')).includes('Child')).toBe(true);
  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.react.reactrouter_v6',
        data: {
          'sentry.segment.name.source': 'route',
          'url.template': '/child/:id',
          'url.path': '/child/abc123',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/child\/abc123$/),
        },
      },
    },
    transaction: '/child/:id',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a navigation transaction with a parameterized URL', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('react-router-6-descendant-routes', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTxnPromise = waitForTransaction('react-router-6-descendant-routes', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/`);
  const pageloadTxn = await pageloadTxnPromise;

  expect(pageloadTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.react.reactrouter_v6',
        data: {
          'sentry.segment.name.source': 'route',
          'url.template': '/',
          'url.path': '/',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/$/),
        },
      },
    },
    transaction: '/',
    transaction_info: {
      source: 'route',
    },
  });

  const linkElement = page.locator('id=navigation');

  const [_, navigationTxn] = await Promise.all([linkElement.click(), navigationTxnPromise]);

  expect((await page.innerHTML('#root')).includes('Details')).toBe(true);
  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.react.reactrouter_v6',
        data: {
          'sentry.segment.name.source': 'route',
          'url.template': '/projects/:projectId/views/:viewId/:detailId',
          'url.path': '/projects/123/views/456/789',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/projects\/123\/views\/456\/789$/),
        },
      },
    },
    transaction: '/projects/:projectId/views/:viewId/:detailId',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a navigation transaction with a parameterized URL - alternative route', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('react-router-6-descendant-routes', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTxnPromise = waitForTransaction('react-router-6-descendant-routes', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/`);
  const pageloadTxn = await pageloadTxnPromise;

  expect(pageloadTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.react.reactrouter_v6',
        data: {
          'sentry.segment.name.source': 'route',
          'url.template': '/',
          'url.path': '/',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/$/),
        },
      },
    },
    transaction: '/',
    transaction_info: {
      source: 'route',
    },
  });

  const linkElement = page.locator('id=old-navigation');

  const [_, navigationTxn] = await Promise.all([linkElement.click(), navigationTxnPromise]);

  expect((await page.innerHTML('#root')).includes('Details')).toBe(true);
  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.react.reactrouter_v6',
        data: {
          'sentry.segment.name.source': 'route',
          'url.template': '/projects/:projectId/old-views/:viewId/:detailId',
          'url.path': '/projects/123/old-views/345/654',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/projects\/123\/old-views\/345\/654$/),
        },
      },
    },
    transaction: '/projects/:projectId/old-views/:viewId/:detailId',
    transaction_info: {
      source: 'route',
    },
  });
});

test('keeps the parent path prefix for a descendant route with non-wildcard nested children - navigation', async ({
  page,
}) => {
  const pageloadTxnPromise = waitForTransaction('react-router-6-descendant-routes', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTxnPromise = waitForTransaction('react-router-6-descendant-routes', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/`);
  const pageloadTxn = await pageloadTxnPromise;

  expect(pageloadTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.react.reactrouter_v6',
        data: {
          'sentry.segment.name.source': 'route',
          'url.template': '/',
          'url.path': '/',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/$/),
        },
      },
    },
    transaction: '/',
    transaction_info: {
      source: 'route',
    },
  });

  const linkElement = page.locator('id=child-navigation');

  const [_, navigationTxn] = await Promise.all([linkElement.click(), navigationTxnPromise]);

  expect((await page.innerHTML('#root')).includes('Child')).toBe(true);
  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.react.reactrouter_v6',
        data: {
          'sentry.segment.name.source': 'route',
          'url.template': '/child/:id',
          'url.path': '/child/abc123',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/child\/abc123$/),
        },
      },
    },
    transaction: '/child/:id',
    transaction_info: {
      source: 'route',
    },
  });
});

test('resolves deep wildcard chain with three levels of nesting - pageload', async ({ page }) => {
  const transactionPromise = waitForTransaction('react-router-6-descendant-routes', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/workspace/team/u123`);

  const rootSpan = await transactionPromise;

  expect((await page.innerHTML('#root')).includes('Deep Member')).toBe(true);
  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.react.reactrouter_v6',
        data: {
          'sentry.segment.name.source': 'route',
          'url.template': '/workspace/:teamId/:memberId',
          'url.path': '/workspace/team/u123',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/workspace\/team\/u123$/),
        },
      },
    },
    transaction: '/workspace/:teamId/:memberId',
    transaction_info: {
      source: 'route',
    },
  });
});

test('does not mix param names across independent descendant routers', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('react-router-6-descendant-routes', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const fooNavigationTxnPromise = waitForTransaction('react-router-6-descendant-routes', async transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.contexts?.trace?.data?.['url.path'] === '/foo/123'
    );
  });

  const barNavigationTxnPromise = waitForTransaction('react-router-6-descendant-routes', async transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.contexts?.trace?.data?.['url.path'] === '/bar/456'
    );
  });

  await page.goto(`/`);
  await pageloadTxnPromise;

  // Mount the first descendant router (`foo/*` -> `:fooId`), which populates the shared `allRoutes` set.
  const [, fooNavigationTxn] = await Promise.all([page.locator('id=foo-navigation').click(), fooNavigationTxnPromise]);

  expect((await page.innerHTML('#root')).includes('Foo')).toBe(true);
  expect(fooNavigationTxn).toMatchObject({
    transaction: '/foo/:fooId',
    transaction_info: { source: 'route' },
  });

  // Return to the index so we can navigate into the second, unrelated descendant router client-side.
  // A fresh page load would reset the module-level `allRoutes` and hide the bug.
  await page.goBack();
  await page.locator('id=bar-navigation').waitFor();

  // Now mount the second descendant router (`bar/*` -> `:barId`). With the accumulation bug, the name
  // comes out as the hybrid `/bar/:fooId`.
  const [, barNavigationTxn] = await Promise.all([page.locator('id=bar-navigation').click(), barNavigationTxnPromise]);

  expect((await page.innerHTML('#root')).includes('Bar')).toBe(true);
  expect(barNavigationTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.react.reactrouter_v6',
        data: {
          'sentry.segment.name.source': 'route',
          'url.template': '/bar/:barId',
          'url.path': '/bar/456',
        },
      },
    },
    transaction: '/bar/:barId',
    transaction_info: {
      source: 'route',
    },
  });
});

test('resolves deep wildcard chain with three levels of nesting - navigation', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('react-router-6-descendant-routes', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTxnPromise = waitForTransaction('react-router-6-descendant-routes', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/`);
  await pageloadTxnPromise;

  const linkElement = page.locator('id=deep-member-navigation');

  const [_, navigationTxn] = await Promise.all([linkElement.click(), navigationTxnPromise]);

  expect((await page.innerHTML('#root')).includes('Deep Member')).toBe(true);
  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.react.reactrouter_v6',
        data: {
          'sentry.segment.name.source': 'route',
          'url.template': '/workspace/:teamId/:memberId',
          'url.path': '/workspace/team/u123',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/workspace\/team\/u123$/),
        },
      },
    },
    transaction: '/workspace/:teamId/:memberId',
    transaction_info: {
      source: 'route',
    },
  });
});
