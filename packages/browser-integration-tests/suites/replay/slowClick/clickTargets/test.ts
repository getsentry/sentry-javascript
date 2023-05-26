import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getCustomRecordingEvents, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

[
  {
    id: 'link',
    slowClick: true,
  },
  {
    id: 'linkExternal',
    slowClick: false,
  },
  {
    id: 'linkDownload',
    slowClick: false,
  },
  {
    id: 'inputButton',
    slowClick: true,
  },
  {
    id: 'inputSubmit',
    slowClick: true,
  },
  {
    id: 'inputText',
    slowClick: false,
  },
].forEach(({ id, slowClick }) => {
  if (slowClick) {
    sentryTest(`slow click is captured for ${id}`, async ({ getLocalTestUrl, page }) => {
      if (shouldSkipReplayTest()) {
        sentryTest.skip();
      }

      const reqPromise0 = waitForReplayRequest(page, 0);

      await page.route('https://dsn.ingest.sentry.io/**/*', route => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'test-id' }),
        });
      });

      const url = await getLocalTestUrl({ testDir: __dirname });

      await page.goto(url);
      await reqPromise0;

      const reqPromise1 = waitForReplayRequest(page, (event, res) => {
        const { breadcrumbs } = getCustomRecordingEvents(res);

        return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');
      });

      await page.click(`#${id}`);

      const { breadcrumbs } = getCustomRecordingEvents(await reqPromise1);

      const slowClickBreadcrumbs = breadcrumbs.filter(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');

      expect(slowClickBreadcrumbs).toEqual([
        {
          category: 'ui.slowClickDetected',
          data: {
            endReason: 'timeout',
            node: {
              attributes: expect.objectContaining({
                id,
              }),
              id: expect.any(Number),
              tagName: expect.any(String),
              textContent: expect.any(String),
            },
            nodeId: expect.any(Number),
            timeAfterClickMs: expect.any(Number),
            url: expect.any(String),
          },
          message: expect.any(String),
          timestamp: expect.any(Number),
        },
      ]);
    });
  } else {
    sentryTest(`slow click is not captured for ${id}`, async ({ getLocalTestUrl, page }) => {
      if (shouldSkipReplayTest()) {
        sentryTest.skip();
      }

      const reqPromise0 = waitForReplayRequest(page, 0);

      await page.route('https://dsn.ingest.sentry.io/**/*', route => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'test-id' }),
        });
      });

      const url = await getLocalTestUrl({ testDir: __dirname });

      await page.goto(url);
      await reqPromise0;

      const reqPromise1 = waitForReplayRequest(page, (event, res) => {
        const { breadcrumbs } = getCustomRecordingEvents(res);

        return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.click');
      });

      await page.click(`#${id}`);

      const { breadcrumbs } = getCustomRecordingEvents(await reqPromise1);

      expect(breadcrumbs).toEqual([
        {
          category: 'ui.click',
          data: {
            node: {
              attributes: expect.objectContaining({
                id,
              }),
              id: expect.any(Number),
              tagName: expect.any(String),
              textContent: expect.any(String),
            },
            nodeId: expect.any(Number),
          },
          message: expect.any(String),
          timestamp: expect.any(Number),
          type: 'default',
        },
      ]);
    });
  }
});
