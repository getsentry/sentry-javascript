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

import { WINDOW } from '../../types';
import type { MetricType } from '../types';
import { generateUniqueID } from './generateUniqueID';
import { getActivationStart } from './getActivationStart';
import { getNavigationEntry } from './getNavigationEntry';

export const initMetric = <MetricName extends MetricType['name']>(name: MetricName, value?: number) => {
  const navEntry = getNavigationEntry();
  let navigationType: MetricType['navigationType'] = 'navigate';

  if (navEntry) {
    if (WINDOW.document.prerendering || getActivationStart() > 0) {
      navigationType = 'prerender';
    } else if (WINDOW.document.wasDiscarded) {
      navigationType = 'restore';
    } else if (navEntry.type) {
      navigationType = navEntry.type.replace(/_/g, '-') as MetricType['navigationType'];
    }
  }

  // Use `entries` type specific for the metric.
  const entries: Extract<MetricType, { name: MetricName }>['entries'] = [];

  return {
    name,
    value: typeof value === 'undefined' ? -1 : value,
    rating: 'good' as const, // If needed, will be updated when reported. `const` to keep the type from widening to `string`.
    delta: 0,
    entries,
    id: generateUniqueID(),
    navigationType,
  };
};
