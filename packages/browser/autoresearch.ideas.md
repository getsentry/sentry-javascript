# Bundle Size Optimization Ideas

## High Impact (Structural Changes)
- **Lazy-load logs infrastructure in Client**: `_INTERNAL_flushLogsBuffer` and `createLogEnvelope` are pulled into browser bundle via direct imports in Client constructor, even though the base CDN bundle doesn't export logs API. Could use dynamic import or client hooks instead.
- **Lazy-load metrics internals**: Similarly, `_INTERNAL_flushMetricsBuffer`, `_enrichMetricAttributes`, and `createMetricEnvelope` are always bundled. If metrics `counter/gauge/distribution` were imported lazily, this code could be tree-shaken from bundles that don't use metrics.
- **Split Client class**: The Client class is ~28KB unminified. It handles errors, sessions, transactions, logs, metrics, and hooks. A modular approach where features register themselves could allow tree-shaking of unused features.
- **Move normalize Vue/React checks to optional module**: `isVueViewModel`, `getVueInternalName`, `isSyntheticEvent` in normalize.ts and safeJoin are framework-specific but always bundled. Could use a registration pattern.

## Medium Impact
- **Simplify getDynamicSamplingContextFromSpan**: 3.1KB unminified, handles both core spans and OpenTelemetry trace state. The OTel path could be stripped in browser-only bundles.
- **Replace `parseUrl` regex with URL API**: The large regex in `parseUrl` could be replaced with `new URL()` in a try/catch for browsers that support it (all modern browsers).
- **Reduce DEFAULT_EVENT_TARGET list**: The 34-entry array of event target names in browserapierrors takes up space. Consider a more compact representation or reduced default list.
- **Consolidate error type checks in eventbuilder**: The eventFromUnknownError function has many sequential type checks (isDOMError, isDOMException, isError, isPlainObject, etc.) that could be consolidated.

## Low Impact (Already Explored)
- Terser config is already well-optimized (passes: 3, ecma: 2017, unsafe_arrows, unsafe_methods, pure_getters, etc.)
- Debug logging is properly stripped in .min.js via DEBUG_BUILD flag
- Node-specific code is tree-shaken via __SENTRY_BROWSER_BUNDLE__ flag
- SyncPromise and AsyncContextStack are already tree-shaken from min bundle
