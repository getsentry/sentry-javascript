# Soft Navigation Web Vitals

## Overview

Experimental support for reporting Web Vitals (LCP, CLS, INP, TTFB, FCP) during soft navigations using Chrome's [Soft Navigation API](https://developer.chrome.com/docs/web-platform/soft-navigation-heuristics).

Enabled via `_experiments.enableSoftNavWebVitals` on `browserTracingIntegration`.

## Current State

### What works

- **INP**: Already works for soft navs. Uses standalone spans which the backend supports.
- **Vendored web-vitals**: All 5 metrics updated with soft nav support (`reportSoftNavs` option, `navigationId` tracking, `includeSoftNavigationObservations` on PerformanceObserver).
- **Wiring**: Full chain from `browserTracingIntegration` -> `instrument.ts` -> vendored web-vitals passes `reportSoftNavs` through.
- **Metric routing**: `_setMeasurement()` helper separates hard nav metrics (stored in `_measurements`) from soft nav metrics (stored in `_softNavMeasurements` Map keyed by `navigationId`).
- **Flush**: `addPerformanceEntries()` matches soft nav measurements to navigation spans by finding the `soft-navigation` performance entry whose start time falls within the span's time window.

### Key bug found and fixed

When the pageload span ended, `_collectWebVitals()` called cleanup callbacks that:
1. Disconnected the PerformanceObserver (`stopOnCallback=true`)
2. Removed the handler from the `handlers` array

This killed LCP/CLS observation before any soft nav could occur. Fix:
- Pass `stopOnCallback=!reportSoftNavs` so observers stay alive when soft navs enabled
- Skip calling `lcpCleanupCallback`/`clsCleanupCallback` in the cleanup function when soft navs enabled

### Known timing limitation

The navigation span (created on `pushState`/`popstate`) has a default idle timeout of 1000ms. Web vitals that arrive **after** the span ends won't be attached as measurements. In practice, many vitals fire within the idle window for soft navs since DOM updates are fast. Vitals arriving late are stored in the Map but won't be flushed.

## Delivery strategy

### Measurements on navigation spans (current approach)

Soft nav web vitals must be delivered as **measurements** on the navigation span — the same format the backend uses for pageload web vitals. The `_softNavMeasurements` Map stores metrics by `navigationId`, and `addPerformanceEntries()` flushes them when the navigation span ends.

### Span-first / v2 (future)

Investigated rebasing on `lms/feat-span-first` (span streaming). Findings:
- **v2 `StreamedSpanJSON` has no `measurements` field** — vitals would become attributes instead
- **Web vitals haven't been migrated** to the span-first model yet (no open PR)
- **Backend doesn't consume v2 web vitals** — no point targeting a format nothing reads yet
- **Segment span is mutable in the buffer** — once vitals migrate to v2, the segment span stays modifiable while child spans are buffered, so late-arriving vitals could be written as attributes before the 5s buffer flush

When span-first migrates web vitals, soft nav support should be straightforward.

## Architecture

```
browserTracingIntegration (enableSoftNavWebVitals)
  -> startTrackingWebVitals({ reportSoftNavs })
    -> _trackLCP / _trackCLS / _trackTtfb (reportSoftNavs)
      -> addLcpInstrumentationHandler(callback, stopOnCallback=!reportSoftNavs, reportSoftNavs)
        -> instrumentLcp(reportSoftNavs)
          -> onLCP(callback, { reportAllChanges: true, reportSoftNavs })
            -> observe('largest-contentful-paint', ..., { includeSoftNavigationObservations })
            -> observe('interaction-contentful-paint', ...)  // soft nav LCP
            -> observe('soft-navigation', ...)               // detect new navs
```

### Metric routing

The `_setMeasurement()` helper routes based on `metric.navigationType`:
- **Hard nav**: `_measurements[name] = { value, unit }` (flushed onto pageload span)
- **Soft nav**: `_softNavMeasurements.get(navigationId)[name] = { value, unit }` (flushed onto navigation span by matching `navigationId`)

## Files modified

| File | Changes |
|------|---------|
| `packages/browser/src/tracing/browserTracingIntegration.ts` | Added `enableSoftNavWebVitals` to `_experiments`, passes to tracking functions |
| `packages/browser-utils/src/metrics/browserMetrics.ts` | `_setMeasurement` helper, `_softNavMeasurements` Map, flush logic in `addPerformanceEntries`, observer lifecycle fix |
| `packages/browser-utils/src/metrics/instrument.ts` | `navigationId` on Metric interface, `reportSoftNavs` param on all handler functions |
| `packages/browser-utils/src/metrics/inp.ts` | `reportSoftNavs` param forwarding |
| `packages/browser-utils/src/metrics/web-vitals/getLCP.ts` | Vendored soft nav support |
| `packages/browser-utils/src/metrics/web-vitals/getCLS.ts` | Vendored soft nav support |
| `packages/browser-utils/src/metrics/web-vitals/getINP.ts` | Vendored soft nav support |
| `packages/browser-utils/src/metrics/web-vitals/onTTFB.ts` | Vendored soft nav support |
| `packages/browser-utils/src/metrics/web-vitals/onFCP.ts` | Vendored soft nav support |
| `packages/browser-utils/src/metrics/web-vitals/lib/*` | `softNavs.ts`, `observe.ts`, `initMetric.ts`, `bindReporter.ts`, `getVisibilityWatcher.ts`, `LCPEntryManager.ts`, etc. |

## Open items

1. **Origin trial**: Chrome requires an origin trial or flag (`#soft-navigation-heuristics`). We could inject a third-party origin trial token via a no-op script tag from our CDN, loaded automatically when the option is enabled.
2. **Cleanup**: Debug `console.log` statements in vendored `getLCP.ts` need to be removed before merging.
3. **Tests**: No tests written yet for the soft nav flow.
4. **Rebase**: Branch is currently rebased on `lms/feat-span-first`. Should rebase back to `develop` since we're using the v1 measurement model.
