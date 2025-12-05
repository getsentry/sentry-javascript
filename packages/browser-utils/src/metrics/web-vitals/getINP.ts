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

import { bindReporter } from './lib/bindReporter';
import { getVisibilityWatcher } from './lib/getVisibilityWatcher';
import { initMetric } from './lib/initMetric';
import { initUnique } from './lib/initUnique';
import { InteractionManager } from './lib/InteractionManager';
import { observe } from './lib/observe';
import { initInteractionCountPolyfill } from './lib/polyfills/interactionCountPolyfill';
import { getSoftNavigationEntry, softNavs } from './lib/softNavs';
import { whenActivated } from './lib/whenActivated';
import { whenIdleOrHidden } from './lib/whenIdleOrHidden';
import type { INPMetric, INPReportOpts, Metric, MetricRatingThresholds } from './types';

/** Thresholds for INP. See https://web.dev/articles/inp#what_is_a_good_inp_score */
export const INPThresholds: MetricRatingThresholds = [200, 500];

// The default `durationThreshold` used across this library for observing
// `event` entries via PerformanceObserver.
const DEFAULT_DURATION_THRESHOLD = 40;

/**
 * Calculates the [INP](https://web.dev/articles/inp) value for the current
 * page and calls the `callback` function once the value is ready, along with
 * the `event` performance entries reported for that interaction. The reported
 * value is a `DOMHighResTimeStamp`.
 *
 * A custom `durationThreshold` configuration option can optionally be passed
 * to control what `event-timing` entries are considered for INP reporting. The
 * default threshold is `40`, which means INP scores of less than 40 will not
 * be reported. To avoid reporting no interactions in these cases, the library
 * will fall back to the input delay of the first interaction. Note that this
 * will not affect your 75th percentile INP value unless that value is also
 * less than 40 (well below the recommended
 * [good](https://web.dev/articles/inp#what_is_a_good_inp_score) threshold).
 *
 * If the `reportAllChanges` configuration option is set to `true`, the
 * `callback` function will be called as soon as the value is initially
 * determined as well as any time the value changes throughout the page
 * lifespan.
 *
 * _**Important:** INP should be continually monitored for changes throughout
 * the entire lifespan of a page—including if the user returns to the page after
 * it's been hidden/backgrounded. However, since browsers often [will not fire
 * additional callbacks once the user has backgrounded a
 * page](https://developer.chrome.com/blog/page-lifecycle-api/#advice-hidden),
 * `callback` is always called when the page's visibility state changes to
 * hidden. As a result, the `callback` function might be called multiple times
 * during the same page load._
 */
export const onINP = (onReport: (metric: INPMetric) => void, opts: INPReportOpts = {}) => {
  // Return if the browser doesn't support all APIs needed to measure INP.
  if (!(globalThis.PerformanceEventTiming && 'interactionId' in PerformanceEventTiming.prototype)) {
    return;
  }

  let reportedMetric = false;
  let metricNavStartTime = 0;
  const softNavsEnabled = softNavs(opts);
  const visibilityWatcher = getVisibilityWatcher();

  whenActivated(() => {
    // TODO(philipwalton): remove once the polyfill is no longer needed.
    initInteractionCountPolyfill(softNavsEnabled);

    let metric = initMetric('INP');
    let report: ReturnType<typeof bindReporter>;

    const interactionManager = initUnique(opts, InteractionManager);

    const initNewINPMetric = (navigation?: Metric['navigationType'], navigationId?: string) => {
      interactionManager._resetInteractions();
      metric = initMetric('INP', -1, navigation, navigationId);
      report = bindReporter(onReport, metric, INPThresholds, opts.reportAllChanges);
      reportedMetric = false;
      if (navigation === 'soft-navigation') {
        const softNavEntry = getSoftNavigationEntry(navigationId);
        metricNavStartTime = softNavEntry?.startTime ?? 0;
      }
    };

    const updateINPMetric = () => {
      const inp = interactionManager._estimateP98LongestInteraction();

      if (inp && (inp._latency !== metric.value || opts.reportAllChanges)) {
        metric.value = inp._latency;
        metric.entries = inp.entries;
      }
    };

    const handleEntries = (entries: INPMetric['entries']) => {
      // Only process entries, if at least some of them have interaction ids
      // (otherwise run into lots of errors later for empty INP entries)
      if (entries.filter(entry => entry.interactionId).length === 0) {
        return;
      }

      // Queue the `handleEntries()` callback in the next idle task.
      // This is needed to increase the chances that all event entries that
      // occurred between the user interaction and the next paint
      // have been dispatched. Note: there is currently an experiment
      // running in Chrome (EventTimingKeypressAndCompositionInteractionId)
      // 123+ that if rolled out fully may make this no longer necessary.
      whenIdleOrHidden(() => {
        for (const entry of entries) {
          interactionManager._processEntry(entry);
        }

        updateINPMetric();
        report();
      });
    };

    const po = observe('event', handleEntries, {
      // Event Timing entries have their durations rounded to the nearest 8ms,
      // so a duration of 40ms would be any event that spans 2.5 or more frames
      // at 60Hz. This threshold is chosen to strike a balance between usefulness
      // and performance. Running this callback for any interaction that spans
      // just one or two frames is likely not worth the insight that could be
      // gained.
      durationThreshold: opts.durationThreshold ?? DEFAULT_DURATION_THRESHOLD,
      opts,
    } as PerformanceObserverInit);

    report = bindReporter(onReport, metric, INPThresholds, opts.reportAllChanges);

    if (po) {
      // Also observe entries of type `first-input`. This is useful in cases
      // where the first interaction is less than the `durationThreshold`.
      po.observe({
        type: 'first-input',
        buffered: true,
        includeSoftNavigationObservations: softNavsEnabled,
      });

      visibilityWatcher.onHidden(() => {
        handleEntries(po.takeRecords() as INPMetric['entries']);
        report(true);
      });

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
          const softNavEntry = getSoftNavigationEntry(entry.navigationId);
          const softNavEntryStartTime = softNavEntry?.startTime ?? 0;
          if (
            entry.navigationId &&
            entry.navigationId !== metric.navigationId &&
            softNavEntryStartTime > metricNavStartTime
          ) {
            // Queue in whenIdleOrHidden in case entry processing for previous
            // metric are queued.
            whenIdleOrHidden(() => {
              handleEntries(po.takeRecords() as INPMetric['entries']);
              if (!reportedMetric && metric.value > 0) report(true);
              initNewINPMetric('soft-navigation', entry.navigationId);
            });
          }
        });
      };

      if (softNavsEnabled) {
        observe('soft-navigation', handleSoftNavEntries, opts);
      }
    }
  });
};
