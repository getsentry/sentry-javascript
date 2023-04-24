import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getCustomRecordingEvents, waitForReplayRequest } from '../../../utils/replayHelpers';

sentryTest(
  'should capture console messages in replay',
  async ({ getLocalTestPath, page, forceFlushReplay, isReplayCapableBundle, bundle }) => {
    // console integration is not used in bundles/loader
    if (!isReplayCapableBundle() || bundle.startsWith('bundle_') || bundle.startsWith('loader_')) {
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

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);
    await reqPromise0;

    const reqPromise1 = waitForReplayRequest(
      page,
      (_event, res) => {
        const { breadcrumbs } = getCustomRecordingEvents(res);

        return breadcrumbs.some(breadcrumb => breadcrumb.category === 'console');
      },
      5_000,
    );

    await page.click('[data-log]');

    // Sometimes this doesn't seem to trigger, so we trigger it twice to be sure...
    await page.click('[data-log]');

    await forceFlushReplay();

    const { breadcrumbs } = getCustomRecordingEvents(await reqPromise1);

    expect(breadcrumbs.filter(breadcrumb => breadcrumb.category === 'console')).toEqual(
      expect.arrayContaining([
        {
          timestamp: expect.any(Number),
          type: 'default',
          category: 'console',
          data: { arguments: ['Test log', '[HTMLElement: HTMLBodyElement]'], logger: 'console' },
          level: 'log',
          message: 'Test log [object HTMLBodyElement]',
        },
      ]),
    );
  },
);

sentryTest(
  'should capture very large console logs',
  async ({ getLocalTestPath, page, forceFlushReplay, isReplayCapableBundle, bundle }) => {
    // console integration is not used in bundles/loader
    if (!isReplayCapableBundle() || bundle.startsWith('bundle_') || bundle.startsWith('loader_')) {
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

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);
    await reqPromise0;

    const reqPromise1 = waitForReplayRequest(
      page,
      (_event, res) => {
        const { breadcrumbs } = getCustomRecordingEvents(res);

        return breadcrumbs.some(breadcrumb => breadcrumb.category === 'console');
      },
      5_000,
    );

    await page.click('[data-log-large]');

    // Sometimes this doesn't seem to trigger, so we trigger it twice to be sure...
    await page.click('[data-log-large]');

    await forceFlushReplay();

    const { breadcrumbs } = getCustomRecordingEvents(await reqPromise1);

    expect(breadcrumbs.filter(breadcrumb => breadcrumb.category === 'console')).toEqual(
      expect.arrayContaining([
        {
          timestamp: expect.any(Number),
          type: 'default',
          category: 'console',
          data: {
            arguments: [
              expect.objectContaining({
                'item-0': {
                  aa: expect.objectContaining({
                    'item-0': {
                      aa: expect.any(Object),
                      bb: expect.any(String),
                      cc: expect.any(String),
                      dd: expect.any(String),
                    },
                  }),
                  bb: expect.any(String),
                  cc: expect.any(String),
                  dd: expect.any(String),
                },
              }),
            ],
            logger: 'console',
            _meta: {
              warnings: ['CONSOLE_ARG_TRUNCATED'],
            },
          },
          level: 'log',
          message: '[object Object]',
        },
      ]),
    );
  },
);
