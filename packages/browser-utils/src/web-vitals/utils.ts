/*
 * Portions of this file are derived from Google's web-vitals library.
 *
 * Copyright 2020-2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { WINDOW } from '../types';

/**
 * web-vitals 5.1.0 switched listeners to be added on the window rather than the document.
 * Instead of having to check for window/document every time we add a listener, we can use this function.
 */
export function addPageListener(type: string, listener: EventListener, options?: boolean | AddEventListenerOptions) {
  if (WINDOW.document) {
    WINDOW.addEventListener(type, listener, options);
  }
}

/**
 * web-vitals 5.1.0 switched listeners to be removed from the window rather than the document.
 * Instead of having to check for window/document every time we remove a listener, we can use this function.
 */
export function removePageListener(type: string, listener: EventListener, options?: boolean | AddEventListenerOptions) {
  if (WINDOW.document) {
    WINDOW.removeEventListener(type, listener, options);
  }
}

// sentry-specific change:
// add optional param to not check for responseStart (see comment below)
export const getNavigationEntry = (checkResponseStart = true): PerformanceNavigationTiming | void => {
  const navigationEntry = WINDOW.performance?.getEntriesByType?.('navigation')[0];
  // Check to ensure the `responseStart` property is present and valid.
  // In some cases a zero value is reported by the browser (for
  // privacy/security reasons), and in other cases (bugs) the value is
  // negative or is larger than the current page time. Ignore these cases:
  // - https://github.com/GoogleChrome/web-vitals/issues/137
  // - https://github.com/GoogleChrome/web-vitals/issues/162
  // - https://github.com/GoogleChrome/web-vitals/issues/275
  if (
    // sentry-specific change:
    // We don't want to check for responseStart for our own use of `getNavigationEntry`
    !checkResponseStart ||
    (navigationEntry && navigationEntry.responseStart > 0 && navigationEntry.responseStart < performance.now())
  ) {
    return navigationEntry;
  }
};

export const getActivationStart = (): number => {
  const hardNavEntry = getNavigationEntry();

  return hardNavEntry?.activationStart ?? 0;
};

let firstHiddenTime = -1;
const onHiddenFunctions: Set<() => void> = new Set();

const initHiddenTime = () => {
  // If the document is hidden when this code runs, assume it was always
  // hidden and the page was loaded in the background, with the one exception
  // that visibility state is always 'hidden' during prerendering, so we have
  // to ignore that case until prerendering finishes (see: `prerenderingchange`
  // event logic below).
  return WINDOW.document?.visibilityState === 'hidden' && !WINDOW.document?.prerendering ? 0 : Infinity;
};

const onVisibilityUpdate = (event: Event) => {
  // Handle changes to hidden state
  if (WINDOW.document?.visibilityState === 'hidden' && firstHiddenTime > -1) {
    // Call onHidden callbacks when the page becomes hidden
    if (event.type === 'visibilitychange') {
      for (const onHiddenFunction of onHiddenFunctions) {
        onHiddenFunction();
      }
    }

    // If the document is 'hidden' and no previous hidden timestamp has been
    // set (so is infinity), update it based on the current event data.
    if (!isFinite(firstHiddenTime)) {
      // If the event is a 'visibilitychange' event, it means the page was
      // visible prior to this change, so the event timestamp is the first
      // hidden time.
      // However, if the event is not a 'visibilitychange' event, then it must
      // be a 'prerenderingchange' event, and the fact that the document is
      // still 'hidden' from the above check means the tab was activated
      // in a background state and so has always been hidden.
      firstHiddenTime = event.type === 'visibilitychange' ? event.timeStamp : 0;

      // We no longer need the `prerenderingchange` event listener now we've
      // set an initial init time so remove that
      // (we'll keep the visibilitychange one for onHiddenFunction above)
      removePageListener('prerenderingchange', onVisibilityUpdate, true);
    }
  }
};

export const getVisibilityWatcher = (reset = false) => {
  if (reset) {
    firstHiddenTime = Infinity;
  }

  if (WINDOW.document && firstHiddenTime < 0) {
    // Check if we have a previous hidden `visibility-state` performance entry.
    const activationStart = getActivationStart();
    const firstVisibilityStateHiddenTime = !WINDOW.document.prerendering
      ? globalThis.performance
          .getEntriesByType('visibility-state')
          .filter(e => e.name === 'hidden' && e.startTime > activationStart)[0]?.startTime
      : undefined;

    // Prefer that, but if it's not available and the document is hidden when
    // this code runs, assume it was hidden since navigation start. This isn't
    // a perfect heuristic, but it's the best we can do until the
    // `visibility-state` performance entry becomes available in all browsers.
    firstHiddenTime = firstVisibilityStateHiddenTime ?? initHiddenTime();
    // Listen for visibility changes so we can handle things like bfcache
    // restores and/or prerender without having to examine individual
    // timestamps in detail and also for onHidden function calls.
    addPageListener('visibilitychange', onVisibilityUpdate, true);

    // IMPORTANT: when a page is prerendering, its `visibilityState` is
    // 'hidden', so in order to account for cases where this module checks for
    // visibility during prerendering, an additional check after prerendering
    // completes is also required.
    addPageListener('prerenderingchange', onVisibilityUpdate, true);
  }

  return {
    get firstHiddenTime() {
      return firstHiddenTime;
    },
    onHidden(cb: () => void) {
      onHiddenFunctions.add(cb);
    },
  };
};

/**
 * Runs the passed callback during the next idle period, or immediately
 * if the browser's visibility state is (or becomes) hidden.
 */
export const whenIdleOrHidden = (cb: () => void) => {
  const rIC = WINDOW.requestIdleCallback || WINDOW.setTimeout;

  // If the document is hidden, run the callback immediately, otherwise
  // race an idle callback with the next `visibilitychange` event.
  if (WINDOW.document?.visibilityState === 'hidden') {
    cb();
  } else {
    // Ensure the callback only runs once, whichever of the two racers wins.
    let called = false;
    const runOnce = () => {
      if (!called) {
        cb();
        called = true;
      }
    };
    addPageListener('visibilitychange', runOnce, { once: true, capture: true });
    rIC(() => {
      runOnce();
      // Remove the above event listener since no longer required.
      // See: https://github.com/GoogleChrome/web-vitals/issues/622
      removePageListener('visibilitychange', runOnce, { capture: true });
    });
  }
};
