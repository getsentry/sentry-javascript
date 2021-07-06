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
import { getVisibilityWatcher } from './lib/getVisibilityWatcher';
import { initMetric } from './lib/initMetric';
import { observe } from './lib/observe';
import { onBFCacheRestore } from './lib/onBFCacheRestore';
import { ReportHandler } from './types';

export const getFCP = (onReport: ReportHandler, reportAllChanges?: boolean): void => {
  const visibilityWatcher = getVisibilityWatcher();
  let metric = initMetric('FCP');
  let report: ReturnType<typeof bindReporter>;

  const entryHandler = (entry: PerformanceEntry): void => {
    if (entry.name === 'first-contentful-paint') {
      if (po) {
        po.disconnect();
      }

      // Only report if the page wasn't hidden prior to the first paint.
      if (entry.startTime < visibilityWatcher.firstHiddenTime) {
        metric.value = entry.startTime;
        metric.entries.push(entry);
        report(true);
      }
    }
  };

  // TODO(philipwalton): remove the use of `fcpEntry` once this bug is fixed.
  // https://bugs.webkit.org/show_bug.cgi?id=225305
  // Also, the check for `getEntriesByName` is needed to support Opera:
  // https://github.com/GoogleChrome/web-vitals/issues/159
  const fcpEntry = performance.getEntriesByName && performance.getEntriesByName('first-contentful-paint')[0];

  const po = fcpEntry ? null : observe('paint', entryHandler);

  if (fcpEntry || po) {
    report = bindReporter(onReport, metric, reportAllChanges);

    if (fcpEntry) {
      entryHandler(fcpEntry);
    }

    onBFCacheRestore(event => {
      metric = initMetric('FCP');
      report = bindReporter(onReport, metric, reportAllChanges);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          metric.value = performance.now() - event.timeStamp;
          report(true);
        });
      });
    });
  }
};
