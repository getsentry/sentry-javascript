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
import { addPageListener } from './globalListeners';

export interface OnHiddenCallback {
  (event: Event): void;
}

/**
 * Calls the passed callback when the page transitions to hidden.
 *
 * Uses the `visibilitychange` event exclusively, which is well-supported
 * across all modern browsers.
 *
 * @param {OnHiddenCallback} cb - Callback to be executed when the page is hidden.
 *
 * @deprecated use `whenIdleOrHidden` or `addPageListener('visibilitychange')` instead
 */
export const onHidden = (cb: OnHiddenCallback) => {
  const onHiddenCallback = (event: Event) => {
    if (WINDOW.document?.visibilityState === 'hidden') {
      cb(event);
    }
  };

  addPageListener('visibilitychange', onHiddenCallback, { capture: true, once: true });
};