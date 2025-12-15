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
import { addPageListener } from './lib/globalListeners';
import { initMetric } from './lib/initMetric';
import { initUnique } from './lib/initUnique';
import { LCPEntryManager } from './lib/LCPEntryManager';
import { observe } from './lib/observe';
import { getSoftNavigationEntry, softNavs } from './lib/softNavs';
import { whenActivated } from './lib/whenActivated';
import { whenIdleOrHidden } from './lib/whenIdleOrHidden';
import type { LCPMetric, Metric, MetricRatingThresholds, ReportOpts } from './types';

/** Thresholds for LCP. See https://web.dev/articles/lcp#what_is_a_good_lcp_score */
export const LCPThresholds: MetricRatingThresholds = [2500, 4000];

/**
 * Calculates the [LCP](https://web.dev/articles/lcp) value for the current page and
 * calls the `callback` function once the value is ready (along with the
 * relevant `largest-contentful-paint` performance entry used to determine the
 * value). The reported value is a `DOMHighResTimeStamp`.
 *
 * If the `reportAllChanges` configuration option is set to `true`, the
 * `callback` function will be called any time a new `largest-contentful-paint`
 * performance entry is dispatched, or once the final value of the metric has
 * been determined.
 */
export const onLCP = (onReport: (metric: LCPMetric) => void, opts: ReportOpts = {}) => {
  let reportedMetric = false;
  const softNavsEnabled = softNavs(opts);
  let metricNavStartTime = 0;
  const hardNavId = getNavigationEntry()?.navigationId || '1';
  let finalizeNavId = '';

  whenActivated(() => {
    let visibilityWatcher = getVisibilityWatcher();
    let metric = initMetric('LCP');
    let report: ReturnType<typeof bindReporter>;

    const lcpEntryManager = initUnique(opts, LCPEntryManager);

    const initNewLCPMetric = (navigation?: Metric['navigationType'], navigationId?: string) => {
      metric = initMetric('LCP', 0, navigation, navigationId);
      report = bindReporter(onReport, metric, LCPThresholds, opts.reportAllChanges);
      reportedMetric = false;
      if (navigation === 'soft-navigation') {
        visibilityWatcher = getVisibilityWatcher(true);
        const softNavEntry = getSoftNavigationEntry(navigationId);
        metricNavStartTime = softNavEntry?.startTime ?? 0;
      }
    };

    const handleEntries = (entries: LCPMetric['entries']) => {
      // If reportAllChanges is set then call this function for each entry,
      // otherwise only consider the last one, unless soft navs are enabled.
      if (!opts.reportAllChanges && !softNavsEnabled) {
        // eslint-disable-next-line no-param-reassign
        entries = entries.slice(-1);
      }

      for (const entry of entries) {
        if (softNavsEnabled && entry?.navigationId !== metric.navigationId) {
          // If the entry is for a new navigationId than previous, then we have
          // entered a new soft nav, so emit the final LCP and reinitialize the
          // metric.
          if (!reportedMetric) report(true);
          initNewLCPMetric('soft-navigation', entry.navigationId);
        }
        let value = 0;
        if (!entry.navigationId || entry.navigationId === hardNavId) {
          // The startTime attribute returns the value of the renderTime if it is
          // not 0, and the value of the loadTime otherwise. The activationStart
          // reference is used because LCP should be relative to page activation
          // rather than navigation start if the page was prerendered. But in cases
          // where `activationStart` occurs after the LCP, this time should be
          // clamped at 0.
          value = Math.max(entry.startTime - getActivationStart(), 0);
        } else {
          // As a soft nav needs an interaction, it should never be before
          // getActivationStart so can just cap to 0
          const softNavEntry = getSoftNavigationEntry(entry.navigationId);
          const softNavEntryStartTime = softNavEntry?.startTime ?? 0;
          value = Math.max(entry.startTime - softNavEntryStartTime, 0);
        }

        lcpEntryManager._processEntry(entry);

        // Only report if the page wasn't hidden prior to LCP.
        if (entry.startTime < visibilityWatcher.firstHiddenTime) {
          // The startTime attribute returns the value of the renderTime if it is
          // not 0, and the value of the loadTime otherwise. The activationStart
          // reference is used because LCP should be relative to page activation
          // rather than navigation start if the page was prerendered. But in cases
          // where `activationStart` occurs after the LCP, this time should be
          // clamped at 0.
          metric.value = value;
          metric.entries = [entry];
          report();
        }
      }
    };

    const po = observe('largest-contentful-paint', handleEntries, opts);

    if (po) {
      report = bindReporter(onReport, metric, LCPThresholds, opts.reportAllChanges);

      const finalizeLCP = (event: Event) => {
        if (event.isTrusted && !reportedMetric) {
          // Finalize the current navigationId metric.
          finalizeNavId = metric.navigationId;
          // Wrap the listener in an idle callback so it's run in a separate
          // task to reduce potential INP impact.
          // https://github.com/GoogleChrome/web-vitals/issues/383
          whenIdleOrHidden(() => {
            if (!reportedMetric) {
              handleEntries(po.takeRecords() as LCPMetric['entries']);
              if (!softNavsEnabled) {
                po.disconnect();
                removeEventListener(event.type, finalizeLCP);
              }
              if (metric.navigationId === finalizeNavId) {
                reportedMetric = true;
                report(true);
              }
            }
          });
        }
      };

      // Stop listening after input or visibilitychange.
      // Note: while scrolling is an input that stops LCP observation, it's
      // unreliable since it can be programmatically generated.
      // See: https://github.com/GoogleChrome/web-vitals/issues/75
      for (const type of ['keydown', 'click', 'visibilitychange']) {
        addPageListener(type, finalizeLCP, {
          capture: true,
        });
      }

      // Soft navs may be detected by navigationId changes in metrics above
      // But where no metric is issued we need to also listen for soft nav
      // entries, then emit the final metric for the previous navigation and
      // reset the metric for the new navigation.
      //
      // As PO is ordered by time, these should not happen before metrics.
      //
      // We add a check on startTime as we may be processing many entries that
      // are already dealt with so just checking navigationId differs from
      // current metric's navigation id, as we did above, is not sufficient.
      const handleSoftNavEntries = (entries: SoftNavigationEntry[]) => {
        entries.forEach(entry => {
          const softNavEntry = entry.navigationId ? getSoftNavigationEntry(entry.navigationId) : null;
          if (
            entry?.navigationId !== metric.navigationId &&
            softNavEntry?.startTime &&
            softNavEntry.startTime > metricNavStartTime
          ) {
            handleEntries(po.takeRecords() as LCPMetric['entries']);
            if (!reportedMetric) report(true);
            initNewLCPMetric('soft-navigation', entry.navigationId);
          }
        });
      };

      if (softNavsEnabled) {
        observe('interaction-contentful-paint', handleEntries, opts);
        observe('soft-navigation', handleSoftNavEntries, opts);
      }
    }
  });
};
