import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { expectedClickBreadcrumb } from '../../../utils/replayEventTemplates';
import { getReplayRecordingContent, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

for (let i = 0; i < 100; i++) {
  sentryTest(
    `replay should have correct click breadcrumbs${i}`,
    async ({ forceFlushReplay, getLocalTestPath, page, browserName }) => {
      // TODO(replay): This is flakey on firefox and webkit where we do not always get the latest mutation.
      if (shouldSkipReplayTest() || ['firefox', 'webkit'].includes(browserName)) {
        sentryTest.skip();
      }

      const reqPromise0 = waitForReplayRequest(page, 0);
      const reqPromise1 = waitForReplayRequest(page, 1);

      await page.route('https://dsn.ingest.sentry.io/**/*', route => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'test-id' }),
        });
      });

      const url = await getLocalTestPath({ testDir: __dirname });

      await page.goto(url);
      await reqPromise0;

      await page.click('#error');
      await page.click('#img');
      await page.click('.sentry-unmask');
      await forceFlushReplay();
      const req1 = await reqPromise1;
      const content1 = getReplayRecordingContent(req1);
      expect(content1.breadcrumbs).toEqual(
        expect.arrayContaining([
          {
            ...expectedClickBreadcrumb,
            message: 'body > div#error.btn.btn-error[aria-label="An Error"]',
            data: {
              nodeId: expect.any(Number),
              node: {
                attributes: {
                  'aria-label': '** *****',
                  class: 'btn btn-error',
                  id: 'error',
                  role: 'button',
                },
                id: expect.any(Number),
                tagName: 'div',
                textContent: '** *****',
              },
            },
          },
        ]),
      );

      expect(content1.breadcrumbs).toEqual(
        expect.arrayContaining([
          {
            ...expectedClickBreadcrumb,
            message: 'body > button > img#img[alt="Alt Text"]',
            data: {
              nodeId: expect.any(Number),
              node: {
                attributes: {
                  alt: 'Alt Text',
                  id: 'img',
                },
                id: expect.any(Number),
                tagName: 'img',
                textContent: '',
              },
            },
          },
        ]),
      );

      expect(content1.breadcrumbs).toEqual(
        expect.arrayContaining([
          {
            ...expectedClickBreadcrumb,
            message: 'body > button.sentry-unmask[aria-label="Unmasked label"]',
            data: {
              nodeId: expect.any(Number),
              node: {
                attributes: {
                  // TODO(rrweb): This is a bug in our rrweb fork!
                  // This attribute should be unmasked.
                  // 'aria-label': 'Unmasked label',
                  'aria-label': '******** *****',
                  class: 'sentry-unmask',
                },
                id: expect.any(Number),
                tagName: 'button',
                textContent: 'Unmasked',
              },
            },
          },
        ]),
      );
    },
  );
}
