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

import type { FirstInputPolyfillCallback } from './types/polyfills';

export * from './types/base';
export * from './types/polyfills';

export * from './types/cls';
export * from './types/fcp';
export * from './types/fid';
export * from './types/inp';
export * from './types/lcp';
export * from './types/ttfb';

// --------------------------------------------------------------------------
// Web Vitals package globals
// --------------------------------------------------------------------------

export interface WebVitalsGlobal {
  firstInputPolyfill: (onFirstInput: FirstInputPolyfillCallback) => void;
  resetFirstInputPolyfill: () => void;
  firstHiddenTime: number;
}

declare global {
  interface Window {
    webVitals: WebVitalsGlobal;
  }
}

// --------------------------------------------------------------------------
// Everything below is modifications to built-in modules.
// --------------------------------------------------------------------------

interface PerformanceEntryMap {
  navigation: PerformanceNavigationTiming;
  resource: PerformanceResourceTiming;
  paint: PerformancePaintTiming;
}

// Update built-in types to be more accurate.
declare global {
  interface Document {
    // https://wicg.github.io/nav-speculation/prerendering.html#document-prerendering
    prerendering?: boolean;
    // https://wicg.github.io/page-lifecycle/#sec-api
    wasDiscarded?: boolean;
  }

  interface Performance {
    getEntriesByType<K extends keyof PerformanceEntryMap>(type: K): PerformanceEntryMap[K][];
  }

  // https://w3c.github.io/event-timing/#sec-modifications-perf-timeline
  interface PerformanceObserverInit {
    durationThreshold?: number;
  }

  // https://wicg.github.io/nav-speculation/prerendering.html#performance-navigation-timing-extension
  interface PerformanceNavigationTiming {
    activationStart?: number;
  }

  // https://wicg.github.io/event-timing/#sec-performance-event-timing
  interface PerformanceEventTiming extends PerformanceEntry {
    duration: DOMHighResTimeStamp;
    interactionId?: number;
  }

  // https://wicg.github.io/layout-instability/#sec-layout-shift-attribution
  interface LayoutShiftAttribution {
    node?: Node;
    previousRect: DOMRectReadOnly;
    currentRect: DOMRectReadOnly;
  }

  // https://wicg.github.io/layout-instability/#sec-layout-shift
  interface LayoutShift extends PerformanceEntry {
    value: number;
    sources: LayoutShiftAttribution[];
    hadRecentInput: boolean;
  }

  // https://w3c.github.io/largest-contentful-paint/#sec-largest-contentful-paint-interface
  interface LargestContentfulPaint extends PerformanceEntry {
    renderTime: DOMHighResTimeStamp;
    loadTime: DOMHighResTimeStamp;
    size: number;
    id: string;
    url: string;
    element?: Element;
  }
}
