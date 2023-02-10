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

  expect(checkoutEvent?.data).toEqual({
    node: {
      type: 0,
      childNodes: [
        {
          type: 1,
          name: 'html',
          publicId: '',
          systemId: '',
          id: 2,
        },
        {
          type: 2,
          tagName: 'html',
          attributes: {},
          childNodes: [
            {
              type: 2,
              tagName: 'head',
              attributes: {},
              childNodes: [
                {
                  type: 2,
                  tagName: 'meta',
                  attributes: {
                    charset: 'utf-8',
                  },
                  childNodes: [],
                  id: 5,
                },
              ],
              id: 4,
            },
            {
              type: 3,
              textContent: '\n  ',
              id: 6,
            },
            {
              type: 2,
              tagName: 'body',
              attributes: {},
              childNodes: [
                {
                  type: 3,
                  textContent: '\n    ',
                  id: 8,
                },
                {
                  type: 2,
                  tagName: 'button',
                  attributes: {
                    'aria-label': '***** **',
                    onclick: "console.log('Test log')",
                  },
                  childNodes: [
                    {
                      type: 3,
                      textContent: '***** **',
                      id: 10,
                    },
                  ],
                  id: 9,
                },
                {
                  type: 3,
                  textContent: '\n    ',
                  id: 11,
                },
                {
                  type: 2,
                  tagName: 'div',
                  attributes: {},
                  childNodes: [
                    {
                      type: 3,
                      textContent: '**** ****** ** ****** ** *******',
                      id: 13,
                    },
                  ],
                  id: 12,
                },
                {
                  type: 3,
                  textContent: '\n    ',
                  id: 14,
                },
                {
                  type: 2,
                  tagName: 'div',
                  attributes: {
                    'data-sentry-unmask': '',
                  },
                  childNodes: [
                    {
                      type: 3,
                      textContent: '**** ****** ** ******** *** ** **** *********',
                      id: 16,
                    },
                  ],
                  id: 15,
                },
                {
                  type: 3,
                  textContent: '\n    ',
                  id: 17,
                },
                {
                  type: 2,
                  tagName: 'input',
                  attributes: {
                    placeholder: '*********** ****** ** ******',
                  },
                  childNodes: [],
                  id: 18,
                },
                {
                  type: 3,
                  textContent: '\n    ',
                  id: 19,
                },
                {
                  type: 2,
                  tagName: 'div',
                  attributes: {
                    title: '***** ****** ** ******',
                  },
                  childNodes: [
                    {
                      type: 3,
                      textContent: '***** ****** ** ******',
                      id: 21,
                    },
                  ],
                  id: 20,
                },
                {
                  type: 3,
                  textContent: '\n    ',
                  id: 22,
                },
                {
                  type: 2,
                  tagName: 'svg',
                  attributes: {
                    rr_width: '200px',
                    rr_height: '200px',
                  },
                  childNodes: [],
                  isSVG: true,
                  id: 23,
                },
                {
                  type: 3,
                  textContent: '\n    ',
                  id: 24,
                },
                {
                  type: 2,
                  tagName: 'svg',
                  attributes: {
                    style: 'width:200px;height:200px',
                    class: 'sentry-unblock',
                    viewBox: '0 0 80 80',
                    'data-sentry-unblock': '',
                  },
                  childNodes: [
                    {
                      type: 2,
                      tagName: 'path',
                      attributes: {
                        rr_width: '0px',
                        rr_height: '0px',
                      },
                      childNodes: [],
                      isSVG: true,
                      id: 26,
                    },
                  ],
                  isSVG: true,
                  id: 25,
                },
                {
                  type: 3,
                  textContent: '\n    ',
                  id: 27,
                },
                {
                  type: 2,
                  tagName: 'img',
                  attributes: {
                    rr_width: '100px',
                    rr_height: '100px',
                  },
                  childNodes: [],
                  id: 28,
                },
                {
                  type: 3,
                  textContent: '\n    ',
                  id: 29,
                },
                {
                  type: 2,
                  tagName: 'img',
                  attributes: {
                    'data-sentry-unblock': '',
                    style: 'width:100px;height:100px',
                    src: 'file:///none.png',
                  },
                  childNodes: [],
                  id: 30,
                },
                {
                  type: 3,
                  textContent: '\n  ',
                  id: 31,
                },
                {
                  type: 3,
                  textContent: '\n\n',
                  id: 32,
                },
              ],
              id: 7,
            },
          ],
          id: 3,
        },
      ],
      id: 1,
    },
    initialOffset: {
      left: 0,
      top: 0,
    },
  });
});
