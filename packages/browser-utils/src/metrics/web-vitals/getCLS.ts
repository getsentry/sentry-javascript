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
import { bindReporter } from './lib/bindReporter';
import { initMetric } from './lib/initMetric';
import { initUnique } from './lib/initUnique';
import { LayoutShiftManager } from './lib/LayoutShiftManager';
import { observe } from './lib/observe';
import { runOnce } from './lib/runOnce';
import { onFCP } from './onFCP';
import type { CLSMetric, MetricRatingThresholds, ReportOpts } from './types';

/** Thresholds for CLS. See https://web.dev/articles/cls#what_is_a_good_cls_score */
export const CLSThresholds: MetricRatingThresholds = [0.1, 0.25];

/**
 * Calculates the [CLS](https://web.dev/articles/cls) value for the current page and
 * calls the `callback` function once the value is ready to be reported, along
 * with all `layout-shift` performance entries that were used in the metric
 * value calculation. The reported value is a `double` (corresponding to a
 * [layout shift score](https://web.dev/articles/cls#layout_shift_score)).
 *
 * If the `reportAllChanges` configuration option is set to `true`, the
 * `callback` function will be called as soon as the value is initially
 * determined as well as any time the value changes throughout the page
 * lifespan.
 *
 * _**Important:** CLS should be continually monitored for changes throughout
 * the entire lifespan of a page—including if the user returns to the page after
 * it's been hidden/backgrounded. However, since browsers often [will not fire
 * additional callbacks once the user has backgrounded a
 * page](https://developer.chrome.com/blog/page-lifecycle-api/#advice-hidden),
 * `callback` is always called when the page's visibility state changes to
 * hidden. As a result, the `callback` function might be called multiple times
 * during the same page load._
 */
export const onCLS = (onReport: (metric: CLSMetric) => void, opts: ReportOpts = {}) => {
  // Start monitoring FCP so we can only report CLS if FCP is also reported.
  // Note: this is done to match the current behavior of CrUX.
  onFCP(
    runOnce(() => {
      const metric = initMetric('CLS', 0);
      let report: ReturnType<typeof bindReporter>;

      const layoutShiftManager = initUnique(opts, LayoutShiftManager);

      const handleEntries = (entries: LayoutShift[]) => {
        for (const entry of entries) {
          layoutShiftManager._processEntry(entry);
        }

        // If the current session value is larger than the current CLS value,
        // update CLS and the entries contributing to it.
        if (layoutShiftManager._sessionValue > metric.value) {
          metric.value = layoutShiftManager._sessionValue;
          metric.entries = layoutShiftManager._sessionEntries;
          report();
        }
      };

      const po = observe('layout-shift', handleEntries);
      if (po) {
        report = bindReporter(onReport, metric, CLSThresholds, opts!.reportAllChanges);

        WINDOW.document?.addEventListener('visibilitychange', () => {
          if (WINDOW.document?.visibilityState === 'hidden') {
            handleEntries(po.takeRecords() as CLSMetric['entries']);
            report(true);
          }
        });

        // Queue a task to report (if nothing else triggers a report first).
        // This allows CLS to be reported as soon as FCP fires when
        // `reportAllChanges` is true.
        WINDOW?.setTimeout?.(report);
      }
    }),
  );
};
