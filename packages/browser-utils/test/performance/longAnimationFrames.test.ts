import {
  BROWSER_SCRIPT_INVOKER,
  BROWSER_SCRIPT_INVOKER_TYPE,
  BROWSER_SCRIPT_SOURCE_CHAR_POSITION,
  CODE_FILE_PATH,
  CODE_FUNCTION_NAME,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { UI_LONG_ANIMATION_FRAME } from '@sentry/conventions/op';
import { getMainCarrier, getSpanDescendants, setCurrentClient, spanToJSON, startSpan } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTrackingLongAnimationFrames } from '../../src/performance/entries';
import { getDefaultClientOptions, TestClient } from '../utils/TestClient';

function mockScript(invoker: string, duration: number, sourceFunctionName: string, sourceCharPosition: number) {
  return {
    invoker,
    invokerType: 'event-listener',
    sourceURL: 'https://example.com/assets/app.js',
    sourceFunctionName,
    sourceCharPosition,
    duration,
  };
}

describe('startTrackingLongAnimationFrames', () => {
  let observerCallback: ((list: PerformanceObserverEntryList) => void) | undefined;

  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    const client = new TestClient(getDefaultClientOptions({ tracesSampleRate: 1 }));
    setCurrentClient(client);
    client.init();

    vi.stubGlobal(
      'PerformanceObserver',
      class {
        public constructor(callback: (list: PerformanceObserverEntryList) => void) {
          observerCallback = callback;
        }

        public observe(): void {
          // noop
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attributes the frame to its longest script, not its first one', () => {
    startTrackingLongAnimationFrames();

    const uiSpans = startSpan({ name: 'pageload', op: 'pageload' }, pageloadSpan => {
      observerCallback!({
        getEntries: () => [
          {
            startTime: 1200,
            duration: 140,
            scripts: [
              mockScript('DOMWindow.onmousedown', 8, 'captureElementFromEvent', 204910),
              mockScript('BUTTON#checkout.onclick', 110, 'handleCheckoutClick', 512),
              mockScript('DOCUMENT.onclick', 6, 'recordBreadcrumb', 1024),
            ],
          },
        ],
      } as unknown as PerformanceObserverEntryList);

      return getSpanDescendants(pageloadSpan).filter(
        span => spanToJSON(span).attributes[SENTRY_OP] === UI_LONG_ANIMATION_FRAME,
      );
    });

    expect(uiSpans).toHaveLength(1);
    expect(spanToJSON(uiSpans[0]!).attributes).toEqual({
      [SENTRY_OP]: UI_LONG_ANIMATION_FRAME,
      [SENTRY_ORIGIN]: 'auto.ui.browser.metrics',
      [BROWSER_SCRIPT_INVOKER]: 'BUTTON#checkout.onclick',
      [BROWSER_SCRIPT_INVOKER_TYPE]: 'event-listener',
      [CODE_FILE_PATH]: 'https://example.com/assets/app.js',
      [CODE_FUNCTION_NAME]: 'handleCheckoutClick',
      [BROWSER_SCRIPT_SOURCE_CHAR_POSITION]: 512,
    });
  });
});
