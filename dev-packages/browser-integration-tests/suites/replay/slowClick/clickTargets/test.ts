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

      const url = await getLocalTestUrl({ testDir: __dirname });

      await Promise.all([waitForReplayRequest(page, 0), page.goto(url)]);

      const [req1] = await Promise.all([
        waitForReplayRequest(page, (event, res) => {
          const { breadcrumbs } = getCustomRecordingEvents(res);

          return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');
        }),

        page.locator(`#${id}`).click(),
      ]);

      const { breadcrumbs } = getCustomRecordingEvents(req1);

      const slowClickBreadcrumbs = breadcrumbs.filter(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');

      expect(slowClickBreadcrumbs).toEqual([
        {
          category: 'ui.slowClickDetected',
          type: 'default',
          data: {
            endReason: 'timeout',
            clickCount: 1,
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

      const url = await getLocalTestUrl({ testDir: __dirname });

      await Promise.all([waitForReplayRequest(page, 0), page.goto(url)]);

      const [req1] = await Promise.all([
        waitForReplayRequest(page, (event, res) => {
          const { breadcrumbs } = getCustomRecordingEvents(res);

          return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.click');
        }),
        page.locator(`#${id}`).click(),
      ]);

      const { breadcrumbs } = getCustomRecordingEvents(req1);

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
