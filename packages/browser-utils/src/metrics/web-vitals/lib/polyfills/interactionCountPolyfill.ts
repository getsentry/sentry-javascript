/*
 * Copyright 2022 Google LLC
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

import { observe } from '../observe';

declare global {
  interface Performance {
    interactionCount: number;
  }
}

let interactionCountEstimate = 0;
let minKnownInteractionId = Infinity;
let maxKnownInteractionId = 0;

const updateEstimate = (entries: PerformanceEventTiming[]) => {
  entries.forEach(e => {
    if (e.interactionId) {
      minKnownInteractionId = Math.min(minKnownInteractionId, e.interactionId);
      maxKnownInteractionId = Math.max(maxKnownInteractionId, e.interactionId);

      interactionCountEstimate = maxKnownInteractionId ? (maxKnownInteractionId - minKnownInteractionId) / 7 + 1 : 0;
    }
  });
};

let po: PerformanceObserver | undefined;

/**
 * Returns the `interactionCount` value using the native API (if available)
 * or the polyfill estimate in this module.
 */
export const getInteractionCount = (): number => {
  return po ? interactionCountEstimate : performance.interactionCount || 0;
};

/**
 * Feature detects native support or initializes the polyfill if needed.
 */
export const initInteractionCountPolyfill = (): void => {
  if ('interactionCount' in performance || po) return;

  po = observe('event', updateEstimate, {
    type: 'event',
    buffered: true,
    durationThreshold: 0,
  } as PerformanceObserverInit);
};
