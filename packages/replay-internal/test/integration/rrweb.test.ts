/**
 * @vitest-environment jsdom
 */

import '../utils/mock-internal-setTimeout';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { resetSdkMock } from '../mocks/resetSdkMock';

describe('Integration | rrweb', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

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
        "blockSelector": ".sentry-block,[data-sentry-block],base,iframe[srcdoc]:not([src]),img,image,svg,video,object,picture,embed,map,audio,link[rel="icon"],link[rel="apple-touch-icon"]",
        "collectFonts": true,
        "emit": [Function],
        "errorHandler": [Function],
        "ignoreCSSAttributes": Set {
          "background-image",
        },
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
        "recordCrossOriginIframes": false,
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
        "blockSelector": ".sentry-block,[data-sentry-block],base,iframe[srcdoc]:not([src]),img,image,svg,video,object,picture,embed,map,audio,link[rel="icon"],link[rel="apple-touch-icon"]",
        "checkoutEveryNms": 360000,
        "collectFonts": true,
        "emit": [Function],
        "errorHandler": [Function],
        "ignoreCSSAttributes": Set {
          "background-image",
        },
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
        "recordCrossOriginIframes": false,
        "slimDOMOptions": "all",
        "unblockSelector": "",
        "unmaskTextSelector": "",
      }
    `);
  });

  it('calls rrweb.record with updated sampling options on iOS', async () => {
    // Mock iOS user agent
    const originalNavigator = global.navigator;
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      },
      configurable: true,
    });

    const { mockRecord } = await resetSdkMock({
      replayOptions: {},
      sentryOptions: {
        replaysOnErrorSampleRate: 1.0,
        replaysSessionSampleRate: 1.0,
      },
    });

    // Restore original navigator
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      configurable: true,
    });

    expect(mockRecord.mock.calls[0]?.[0]).toMatchInlineSnapshot(`
      {
        "blockSelector": ".sentry-block,[data-sentry-block],base,iframe[srcdoc]:not([src]),img,image,svg,video,object,picture,embed,map,audio,link[rel="icon"],link[rel="apple-touch-icon"]",
        "collectFonts": true,
        "emit": [Function],
        "errorHandler": [Function],
        "ignoreCSSAttributes": Set {
          "background-image",
        },
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
        "recordCrossOriginIframes": false,
        "sampling": {
          "mousemove": false,
        },
        "slimDOMOptions": "all",
        "unblockSelector": "",
        "unmaskTextSelector": "",
      }
    `);
  });
});
