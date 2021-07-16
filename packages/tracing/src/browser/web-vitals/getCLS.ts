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

import { bindReporter } from './lib/bindReporter';
import { initMetric } from './lib/initMetric';
import { observe, PerformanceEntryHandler } from './lib/observe';
import { onHidden } from './lib/onHidden';
import { ReportHandler } from './types';

// https://wicg.github.io/layout-instability/#sec-layout-shift
export interface LayoutShift extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
  sources: Array<LayoutShiftAttribution>;
  toJSON(): Record<string, unknown>;
}

export interface LayoutShiftAttribution {
  node?: Node;
  previousRect: DOMRectReadOnly;
  currentRect: DOMRectReadOnly;
}

export const getCLS = (onReport: ReportHandler, reportAllChanges?: boolean): void => {
  const metric = initMetric('CLS', 0);
  let report: ReturnType<typeof bindReporter>;

  const entryHandler = (entry: LayoutShift): void => {
    if (!entry.hadRecentInput) {
      (metric.value as number) += entry.value;
      metric.entries.push(entry);
      if (report) {
        report();
      }
    }
  };

  const po = observe('layout-shift', entryHandler as PerformanceEntryHandler);
  if (po) {
    report = bindReporter(onReport, metric, reportAllChanges);

    onHidden(() => {
      po.takeRecords().map(entryHandler as PerformanceEntryHandler);
      report(true);
    });
  }
};
