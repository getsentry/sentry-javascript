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
import { finalMetrics } from './lib/finalMetrics';
import { getFirstHidden } from './lib/getFirstHidden';
import { initMetric } from './lib/initMetric';
import { observe, PerformanceEntryHandler } from './lib/observe';
import { onBFCacheRestore } from './lib/onBFCacheRestore';
import { onHidden } from './lib/onHidden';
import { firstInputPolyfill, resetFirstInputPolyfill } from './lib/polyfills/firstInputPolyfill';
import { FirstInputPolyfillCallback, PerformanceEventTiming, ReportHandler } from './types';

interface FIDPolyfillCallback {
  (value: number, event: Event): void;
}

interface FIDPolyfill {
  onFirstInputDelay: (onReport: FIDPolyfillCallback) => void;
}

declare global {
  interface Window {
    perfMetrics: FIDPolyfill;
  }
}

export const getFID = (onReport: ReportHandler, reportAllChanges?: boolean): void => {
  let metric = initMetric('FID');
  const firstHidden = getFirstHidden();

  let report: ReturnType<typeof bindReporter>;

  const entryHandler = (entry: PerformanceEventTiming): void => {
    // Only report if the page wasn't hidden prior to the first input.
    if (entry.startTime < firstHidden.timeStamp) {
      metric.value = entry.processingStart - entry.startTime;
      metric.entries.push(entry);
      finalMetrics.add(metric);
      report();
    }
  };

  const po = observe('first-input', entryHandler as PerformanceEntryHandler);
  report = bindReporter(onReport, metric, reportAllChanges);

  if (po) {
    onHidden(() => {
      po.takeRecords().map(entryHandler as PerformanceEntryHandler);
      po.disconnect();
    }, true);

    if (po) {
      onBFCacheRestore(() => {
        metric = initMetric('FID');
        report = bindReporter(onReport, metric, reportAllChanges);
        resetFirstInputPolyfill();
        firstInputPolyfill(entryHandler as FirstInputPolyfillCallback);
      });
    }
  } else {
    firstInputPolyfill(entryHandler as FirstInputPolyfillCallback);
  }
};
