import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../utils/helpers';
import {
  expectedClickBreadcrumb,
} from '../../../utils/replayEventTemplates';
import {
  getReplayEvent,
  getReplayRecordingContent,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../utils/replayHelpers';

sentryTest('replay should have correct click breadcrumbs', async ({ forceFlushReplay, getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);
  const reqPromise1 = waitForReplayRequest(page, 1);
  // const reqPromise2 = waitForReplayRequest(page, 2);

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);
  await reqPromise0

  await page.click('#error');
  await page.click('#img');
  await page.click('.sentry-unmask');
  await forceFlushReplay();
  const req1 = await reqPromise1
    // const event0 = getReplayEvent(req0);
    const content1 = getReplayRecordingContent(req1);
    expect(content1.breadcrumbs).toEqual(
      expect.arrayContaining([
        {
          ...expectedClickBreadcrumb,
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
      ])
  );

    expect(content1.breadcrumbs).toEqual(
      expect.arrayContaining([
        {
          ...expectedClickBreadcrumb,
          data: {
            nodeId: expect.any(Number),
            node: {
              attributes: {
                'alt': 'Alt Text',
                id: 'img',
              },
              id: expect.any(Number),
              tagName: 'img',
            textContent: '',
            },
          },
        },
      ])
  );

    expect(content1.breadcrumbs).toEqual(
      expect.arrayContaining([
        {
          ...expectedClickBreadcrumb,
          data: {
            nodeId: expect.any(Number),
            node: {
              attributes: {
              // TODO(rrweb): This is a bug in our rrweb fork!
              // This attribute should be unmasked.
                // 'aria-label': 'Unmasked label',
                'aria-label': '******** *****',
                'class': 'sentry-unmask',
              },
              id: expect.any(Number),
              tagName: 'button',
              textContent: 'Unmasked',
            },
          },
        },
      ])
  );
});
