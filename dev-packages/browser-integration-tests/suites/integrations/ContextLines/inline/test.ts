import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequestOnUrl } from '../../../../utils/helpers';

sentryTest(
  'should add source context lines around stack frames from errors in Html inline JS',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (browserName === 'webkit') {
      // The error we're throwing in this test is thrown as "Script error." in Webkit.
      // We filter "Script error." out by default in `InboundFilters`.
      // I don't think there's much value to disable InboundFilters defaults for this test,
      // given that most of our users won't do that either.
      // Let's skip it instead for Webkit.
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const eventReqPromise = waitForErrorRequestOnUrl(page, url);
    await page.waitForFunction('window.Sentry');

    const clickPromise = page.locator('#inline-error-btn').click();

    const [req] = await Promise.all([eventReqPromise, clickPromise]);

    const eventData = envelopeRequestParser(req);

    expect(eventData.exception?.values).toHaveLength(1);

    const exception = eventData.exception?.values?.[0];

    expect(exception).toMatchObject({
      stacktrace: {
        frames: [
          {
            pre_context: ['<!DOCTYPE html>', '<html>', '<head>', '    <meta charset="utf-8">', '  </head>', '  <body>'],
            context_line:
              '      <button id="inline-error-btn" onclick="throw new Error(\'Error with context lines\')">Click me</button>',
            post_context: [
              expect.stringContaining('<script'), // this line varies in the test based on tarball/cdn bundle (+variants)
              '  <footer>',
              '    Some text...',
              '  ',
              '',
              '</footer></body>',
              '</html>',
            ],
          },
        ],
      },
    });
  },
);
