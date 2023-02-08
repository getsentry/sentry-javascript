import { expect } from '@playwright/test';
import { EventType } from '@sentry-internal/rrweb';
import type { RecordingEvent } from '@sentry/replay/build/npm/types/types';

import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser } from '../../../utils/helpers';
import { waitForReplayRequest } from '../../../utils/replayHelpers';

sentryTest('should have the correct default privacy settings', async ({ getLocalTestPath, page }) => {
  // Replay bundles are es6 only
  if (process.env.PW_BUNDLE && process.env.PW_BUNDLE.startsWith('bundle_es5')) {
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
  const replayPayload = envelopeRequestParser<RecordingEvent[]>(await reqPromise0, 5);
  const checkoutEvent = replayPayload.find(({ type }) => type === EventType.FullSnapshot);

  expect(checkoutEvent?.data).toMatchObject({
    initialOffset: {
      left: 0,
      top: 0,
    },
    node: {
      childNodes: [
        {
          id: 2,
          name: 'html',
          publicId: '',
          systemId: '',
          type: 1,
        },
        {
          attributes: {},
          childNodes: [
            {
              attributes: {},
              childNodes: [
                {
                  attributes: {
                    charset: 'utf-8',
                  },
                  childNodes: [],
                  id: 5,
                  tagName: 'meta',
                  type: 2,
                },
              ],
              id: 4,
              tagName: 'head',
              type: 2,
            },
            {
              id: 6,
              textContent: '\n  ',
              type: 3,
            },
            {
              attributes: {},
              childNodes: [
                {
                  id: 8,
                  textContent: '\n    ',
                  type: 3,
                },
                {
                  attributes: {
                    'aria-label': 'Click me',
                    onclick: "console.log('Test log')",
                  },
                  childNodes: [
                    {
                      id: 10,
                      textContent: '***** **',
                      type: 3,
                    },
                  ],
                  id: 9,
                  tagName: 'button',
                  type: 2,
                },
                {
                  id: 11,
                  textContent: '\n    ',
                  type: 3,
                },
                {
                  attributes: {},
                  childNodes: [
                    {
                      id: 13,
                      textContent: '**** ****** ** ****** ** *******',
                      type: 3,
                    },
                  ],
                  id: 12,
                  tagName: 'div',
                  type: 2,
                },
                {
                  id: 14,
                  textContent: '\n    ',
                  type: 3,
                },
                {
                  attributes: {
                    'data-sentry-unmask': '',
                  },
                  childNodes: [
                    {
                      id: 16,
                      textContent: 'This should be unmasked due to data attribute',
                      type: 3,
                    },
                  ],
                  id: 15,
                  tagName: 'div',
                  type: 2,
                },
                {
                  id: 17,
                  textContent: '\n    ',
                  type: 3,
                },
                {
                  attributes: {
                    placeholder: 'Placeholder should be masked',
                  },
                  childNodes: [],
                  id: 18,
                  tagName: 'input',
                  type: 2,
                },
                {
                  id: 19,
                  textContent: '\n    ',
                  type: 3,
                },
                {
                  attributes: {
                    title: 'Title should be masked',
                  },
                  childNodes: [
                    {
                      id: 21,
                      textContent: '***** ****** ** ******',
                      type: 3,
                    },
                  ],
                  id: 20,
                  tagName: 'div',
                  type: 2,
                },
                {
                  id: 22,
                  textContent: '\n    ',
                  type: 3,
                },
                {
                  attributes: {
                    rr_height: '1264px',
                    rr_width: '1264px',
                  },
                  childNodes: [],
                  id: 23,
                  isSVG: true,
                  tagName: 'svg',
                  type: 2,
                },
                {
                  id: 24,
                  textContent: '\n    ',
                  type: 3,
                },
                {
                  attributes: {
                    rr_height: '0px',
                    rr_width: '0px',
                  },
                  childNodes: [],
                  id: 25,
                  tagName: 'img',
                  type: 2,
                },
                {
                  id: 26,
                  textContent: '\n  ',
                  type: 3,
                },
                {
                  id: 27,
                  textContent: '\n\n',
                  type: 3,
                },
              ],
              id: 7,
              tagName: 'body',
              type: 2,
            },
          ],
          id: 3,
          tagName: 'html',
          type: 2,
        },
      ],
      id: 1,
      type: 0,
    },
  });
});
