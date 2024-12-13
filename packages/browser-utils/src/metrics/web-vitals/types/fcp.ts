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

import type { LoadState, Metric } from './base';

/**
 * An FCP-specific version of the Metric object.
 */
export interface FCPMetric extends Metric {
  name: 'FCP';
  entries: PerformancePaintTiming[];
}

/**
 * An object containing potentially-helpful debugging information that
 * can be sent along with the FCP value for the current page visit in order
 * to help identify issues happening to real-users in the field.
 */
export interface FCPAttribution {
  /**
   * The time from when the user initiates loading the page until when the
   * browser receives the first byte of the response (a.k.a. TTFB).
   */
  timeToFirstByte: number;
  /**
   * The delta between TTFB and the first contentful paint (FCP).
   */
  firstByteToFCP: number;
  /**
   * The loading state of the document at the time when FCP `occurred (see
   * `LoadState` for details). Ideally, documents can paint before they finish
   * loading (e.g. the `loading` or `dom-interactive` phases).
   */
  loadState: LoadState;
  /**
   * The `PerformancePaintTiming` entry corresponding to FCP.
   */
  fcpEntry?: PerformancePaintTiming;
  /**
   * The `navigation` entry of the current page, which is useful for diagnosing
   * general page load issues. This can be used to access `serverTiming` for example:
   * navigationEntry?.serverTiming
   */
  navigationEntry?: PerformanceNavigationTiming;
}

/**
 * An FCP-specific version of the Metric object with attribution.
 */
export interface FCPMetricWithAttribution extends FCPMetric {
  attribution: FCPAttribution;
}
