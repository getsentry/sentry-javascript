/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetSdkMock } from '../mocks/resetSdkMock';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

describe('Integration | rrweb', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls rrweb.record with custom options', async () => {
    const { mockRecord } = await resetSdkMock({
      replayOptions: {
        ignore: ['.sentry-test-ignore'],
        stickySession: false,
      },
    });
    expect(mockRecord.mock.calls[0]?.[0]).toMatchInlineSnapshot(`
      {
        "blockSelector": ".sentry-block,[data-sentry-block],base[href="/"],img,image,svg,video,object,picture,embed,map,audio,link[rel="icon"],link[rel="apple-touch-icon"]",
        "collectFonts": true,
        "emit": [Function],
        "errorHandler": [Function],
        "ignoreSelector": ".sentry-test-ignore,.sentry-ignore,[data-sentry-ignore],input[type="file"]",
        "inlineImages": false,
        "inlineStylesheet": true,
        "maskAllInputs": true,
        "maskAllText": true,
        "maskAttributeFn": [Function],
        "maskInputFn": undefined,
        "maskInputOptions": {
          "password": true,
        },
        "maskTextFn": undefined,
        "maskTextSelector": ".sentry-mask,[data-sentry-mask]",
        "onMutation": [Function],
        "slimDOMOptions": "all",
        "unblockSelector": "",
        "unmaskTextSelector": "",
      }
    `);
  });

  it('calls rrweb.record with checkoutEveryNms', async () => {
    const { mockRecord } = await resetSdkMock({
      replayOptions: {
        _experiments: {
          continuousCheckout: 1,
        },
      },
      sentryOptions: {
        replaysOnErrorSampleRate: 0.0,
        replaysSessionSampleRate: 1.0,
      },
    });

    expect(mockRecord.mock.calls[0]?.[0]).toMatchInlineSnapshot(`
      {
        "blockSelector": ".sentry-block,[data-sentry-block],base[href="/"],img,image,svg,video,object,picture,embed,map,audio,link[rel="icon"],link[rel="apple-touch-icon"]",
        "checkoutEveryNms": 360000,
        "collectFonts": true,
        "emit": [Function],
        "errorHandler": [Function],
        "ignoreSelector": ".sentry-ignore,[data-sentry-ignore],input[type="file"]",
        "inlineImages": false,
        "inlineStylesheet": true,
        "maskAllInputs": true,
        "maskAllText": true,
        "maskAttributeFn": [Function],
        "maskInputFn": undefined,
        "maskInputOptions": {
          "password": true,
        },
        "maskTextFn": undefined,
        "maskTextSelector": ".sentry-mask,[data-sentry-mask]",
        "onMutation": [Function],
        "slimDOMOptions": "all",
        "unblockSelector": "",
        "unmaskTextSelector": "",
      }
    `);
  });
});
