/*
 * Copyright 2020 Google LLC
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

import { WINDOW } from '../../../types';

export interface OnHiddenCallback {
  (event: Event): void;
}

// Sentry-specific change:
// This function's logic was NOT updated to web-vitals 4.2.4 but we continue
// to use the web-vitals 3.5.2 due to us having stricter browser support.
// PR with context that made the changes: https://github.com/GoogleChrome/web-vitals/pull/442/files#r1530492402
// The PR removed listening to the `pagehide` event, in favour of only listening to `visibilitychange` event.
// This is "more correct" but some browsers we still support (Safari 12.1-14.0) don't fully support `visibilitychange`
// or have known bugs w.r.t the `visibilitychange` event.
// TODO (v9): If we decide to drop support for Safari 12.1-14.0, we can use the logic from web-vitals 4.2.4
// In this case, we also need to update the integration tests that currently trigger the `pagehide` event to
// simulate the page being hidden.
export const onHidden = (cb: OnHiddenCallback) => {
  const onHiddenOrPageHide = (event: Event) => {
    if (event.type === 'pagehide' || (WINDOW.document && WINDOW.document.visibilityState === 'hidden')) {
      cb(event);
    }
  };

  if (WINDOW.document) {
    addEventListener('visibilitychange', onHiddenOrPageHide, true);
    // Some browsers have buggy implementations of visibilitychange,
    // so we use pagehide in addition, just to be safe.
    addEventListener('pagehide', onHiddenOrPageHide, true);
  }
};
