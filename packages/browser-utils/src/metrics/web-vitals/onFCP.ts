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
import { getActivationStart } from './lib/getActivationStart';
import { getNavigationEntry } from './lib/getNavigationEntry';
import { getVisibilityWatcher } from './lib/getVisibilityWatcher';
import { initMetric } from './lib/initMetric';
import { observe } from './lib/observe';
import { getSoftNavigationEntry, softNavs } from './lib/softNavs';
import { whenActivated } from './lib/whenActivated';
import type { FCPMetric, Metric, MetricRatingThresholds, ReportOpts } from './types';

/** Thresholds for FCP. See https://web.dev/articles/fcp#what_is_a_good_fcp_score */
export const FCPThresholds: MetricRatingThresholds = [1800, 3000];

/**
 * Calculates the [FCP](https://web.dev/articles/fcp) value for the current page and
 * calls the `callback` function once the value is ready, along with the
 * relevant `paint` performance entry used to determine the value. The reported
 * value is a `DOMHighResTimeStamp`.
 */
export const onFCP = (onReport: (metric: FCPMetric) => void, opts: ReportOpts = {}) => {
  // Set defaults
  const softNavsEnabled = softNavs(opts);
  let metricNavStartTime = 0;
  const hardNavId = getNavigationEntry()?.navigationId || '1';

  whenActivated(() => {
    let visibilityWatcher = getVisibilityWatcher();
    let metric = initMetric('FCP');
    let report: ReturnType<typeof bindReporter>;

    const initNewFCPMetric = (navigation?: Metric['navigationType'], navigationId?: string) => {
      metric = initMetric('FCP', 0, navigation, navigationId);
      report = bindReporter(onReport, metric, FCPThresholds, opts.reportAllChanges);
      if (navigation === 'soft-navigation') {
        visibilityWatcher = getVisibilityWatcher(true);
        const softNavEntry = navigationId ? getSoftNavigationEntry(navigationId) : null;
        metricNavStartTime = softNavEntry ? softNavEntry.startTime || 0 : 0;
      }
    };

    const handleEntries = (entries: FCPMetric['entries']) => {
      for (const entry of entries) {
        if (entry.name === 'first-contentful-paint') {
          if (!softNavsEnabled) {
            // If we're not using soft navs monitoring, we should not see
            // any more FCPs so can disconnect the performance observer
            po!.disconnect();
          } else if (entry.navigationId && entry.navigationId !== metric.navigationId) {
            // If the entry is for a new navigationId than previous, then we have
            // entered a new soft nav, so reinitialize the metric.
            initNewFCPMetric('soft-navigation', entry.navigationId);
          }

          let value = 0;

          if (!entry.navigationId || entry.navigationId === hardNavId) {
            // Only report if the page wasn't hidden prior to the first paint.
            // The activationStart reference is used because FCP should be
            // relative to page activation rather than navigation start if the
            // page was prerendered. But in cases where `activationStart` occurs
            // after the FCP, this time should be clamped at 0.
            value = Math.max(entry.startTime - getActivationStart(), 0);
          } else {
            const softNavEntry = getSoftNavigationEntry(entry.navigationId);
            const softNavStartTime = softNavEntry?.startTime ?? 0;
            // As a soft nav needs an interaction, it should never be before
            // getActivationStart so can just cap to 0
            value = Math.max(entry.startTime - softNavStartTime, 0);
          }

          // Only report if the page wasn't hidden prior to FCP.
          // Or it's a soft nav FCP
          const softNavEntry =
            softNavsEnabled && entry.navigationId ? getSoftNavigationEntry(entry.navigationId) : null;
          const softNavEntryStartTime = softNavEntry?.startTime ?? 0;
          if (
            entry.startTime < visibilityWatcher.firstHiddenTime ||
            (softNavsEnabled &&
              entry.navigationId &&
              entry.navigationId !== metric.navigationId &&
              entry.navigationId !== hardNavId &&
              softNavEntryStartTime > metricNavStartTime)
          ) {
            metric.value = value;
            metric.entries.push(entry);
            metric.navigationId = entry.navigationId || '1';
            // FCP should only be reported once so can report right
            report(true);
          }
        }
      }
    };

    const po = observe('paint', handleEntries, opts);

    if (po) {
      report = bindReporter(onReport, metric, FCPThresholds, opts.reportAllChanges);
    }
  });
};
