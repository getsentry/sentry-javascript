# Bundle Size Optimization Ideas

## High Impact (Structural Changes — needs team discussion)
- **Split Client class**: The Client class is ~28KB unminified. It handles errors, sessions, transactions, logs, metrics, and hooks. A modular approach where features register themselves could allow tree-shaking of unused features in specific bundle variants.
- **Move normalize Vue/React checks to optional module**: `isVueViewModel`, `getVueInternalName`, `isSyntheticEvent` in normalize.ts and safeJoin are framework-specific but always bundled. Could use a registration pattern where Vue/React SDKs register their own stringification.

## Medium Impact (Needs Investigation)
- **Simplify getDynamicSamplingContextFromSpan**: 3.1KB unminified, handles both core spans and OpenTelemetry trace state. The OTel path could potentially be stripped in browser-only bundles if guarded by a build-time flag.
- **Consolidate iframe-based native checks**: `getNativeImplementation` (browser-utils) still creates an iframe. Could explore caching the iframe result across both function calls.

## Already Exhausted
- Terser config fully optimized (passes:5, ecma:2020, toplevel, unsafe_arrows, unsafe_methods, unsafe_comps, unsafe_math, pure_getters, mangle.toplevel)
- String constant extraction doesn't help gzip (gzip already compresses repeated patterns)
- baggage.ts startsWith vs match — no gzip difference
- unsafe_Function, unsafe_proto, unsafe_regexp, module — no improvement
- CDN bundle shim warning strings are intentional (production warnings)
- `supportsNativeFetch` iframe removed — ✅ done (big win: 200B gzipped)
- `ITEM_TYPE_TO_DATA_CATEGORY_MAP` slimmed — ✅ done (38B gzipped)
- `DEFAULT_IGNORE_ERRORS` patterns shortened — ✅ done (38B gzipped total)
- `sendSession` consolidated — ✅ done (16B gzipped)
- `getReportDialogEndpoint` URLSearchParams — ✅ done (26B gzipped)
