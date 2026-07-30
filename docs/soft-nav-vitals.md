# Soft Navigation Web Vitals

## Overview

Experimental support for reporting Web Vitals (LCP, CLS, INP, TTFB, FCP) during Chrome
[soft navigations](https://developer.chrome.com/docs/web-platform/soft-navigation-heuristics), in
addition to the initial pageload.

Enabled via `_experiments.enableSoftNavWebVitals` on `browserTracingIntegration` (which forwards it
as `reportSoftNavs` to `webVitalsIntegration`).

```js
Sentry.browserTracingIntegration({
  _experiments: { enableSoftNavWebVitals: true },
});
```

Chrome gates the Soft Navigation API behind an origin trial or the `#soft-navigation-heuristics`
flag, so the option is a no-op on browsers where the API is unavailable (the vendored `softNavs()`
gate feature-detects `PerformanceObserver.supportedEntryTypes.includes('soft-navigation')`).

## How it works

### Vendored web-vitals

The vendored library (`packages/browser-utils/src/metrics/web-vitals/`) carries the soft-nav port
of upstream [#308](https://github.com/GoogleChrome/web-vitals/pull/308). The `reportSoftNavs` report
option is threaded through every metric. When enabled:

- Each metric gains a `navigationId`; a new `navigationId` on an incoming entry signals a soft
  navigation, so the previous metric is finalized/reported and a fresh one is initialized with
  `navigationType: 'soft-navigation'`.
- Extra observers are registered: `soft-navigation` (to detect new navigations) and, for LCP,
  `interaction-contentful-paint` (soft-nav LCP).
- Observers pass `includeSoftNavigationObservations` and sort entries by end time.
- LCP/CLS observers are kept alive across the page lifetime instead of being finalized when the
  pageload span ends.

See the vendored `README.md` for the BFCache caveat (upstream shipped soft-nav in v6.0.0 entangled
with BFCache, which we intentionally removed; the port targets our BFCache-free v5.1.0 base).

### Delivery: v1 measurements vs v2 spans

Delivery follows the same split as pageload vitals, driven by `hasSpanStreamingEnabled(client)`:

- **Pageload (hard nav) vitals** are unchanged: v1 measurements on the pageload span, or v2 streamed
  spans via `trackLcpAsSpan` / `trackClsAsSpan` / `trackInpAsSpan` when streaming is enabled.
- **Soft nav vitals** are always emitted as **v2 spans**. In `browserMetrics.ts`, `_emitMeasurement`
  routes on `metric.navigationType`: hard navs write `_measurements`; soft navs call
  `_emitSoftNavWebVitalSpan`, which starts a regular (non-standalone) `startInactiveSpan` so it flows
  through the span-streaming pipeline (`afterSpanEnd` -> `SpanBuffer`) and is grouped with the
  navigation span by trace ID.

Because soft-nav spans group by trace ID in the buffer rather than by matching a span time window,
there is no navigation-span idle-timeout race: a vital arriving slightly after the navigation span
ends still lands in the same trace.

## Wiring

```
browserTracingIntegration (_experiments.enableSoftNavWebVitals)
  -> webVitalsIntegration({ reportSoftNavs })
    -> startTrackingWebVitals({ ..., reportSoftNavs })   // v1 path + soft-nav span emission
    -> trackLcpAsSpan(client, reportSoftNavs)            // v2 streaming path
    -> trackClsAsSpan(client, reportSoftNavs)
    -> trackInpAsSpan(client, reportSoftNavs)
      -> add{Lcp,Cls,Inp,Ttfb}InstrumentationHandler(cb, stopOnCallback?, reportSoftNavs)
        -> instrument{Lcp,Cls,Inp,Ttfb}(reportSoftNavs)
          -> on{LCP,CLS,INP,TTFB,FCP}(cb, { reportSoftNavs })
```

## Files

| File                                                        | Role                                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/browser/src/tracing/browserTracingIntegration.ts` | `_experiments.enableSoftNavWebVitals`, forwarded into `webVitalsIntegration` |
| `packages/browser/src/integrations/webVitals.ts`            | `reportSoftNavs` option, threaded into tracking functions                    |
| `packages/browser-utils/src/metrics/browserMetrics.ts`      | `_emitMeasurement` router, `_emitSoftNavWebVitalSpan`, observer keep-alive   |
| `packages/browser-utils/src/metrics/webVitalSpans.ts`       | `reportSoftNavs` param on `track{Lcp,Cls,Inp}AsSpan`                         |
| `packages/browser-utils/src/metrics/instrument.ts`          | `navigationId` on `Metric`, `reportSoftNavs` on handlers                     |
| `packages/browser-utils/src/metrics/web-vitals/**`          | Vendored soft-nav port (`softNavs.ts`, per-metric re-init, observers)        |

## Open items

1. **Origin trial**: the Soft Navigation API requires an origin trial or the
   `#soft-navigation-heuristics` flag. We currently only document the requirement; we do not ship a
   token.
2. **Tests**: unit coverage exists for the wiring (`webVitals.test.ts`); an end-to-end
   browser-integration suite driving a real soft navigation is still to be added.
3. **Backend**: soft-nav vitals arrive as v2 web-vital spans grouped by trace ID; confirm the backend
   surfaces them on the navigation the same way it does pageload vitals.
