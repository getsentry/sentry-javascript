# Bundle Size Optimization Ideas

## High Impact (Structural Changes — needs team discussion)
- **Split Client class**: The Client class is ~28KB unminified. It handles errors, sessions, transactions, logs, metrics, and hooks. A modular approach where features register themselves could allow tree-shaking of unused features in specific bundle variants.
- **Move normalize Vue/React checks to optional module**: `isVueViewModel`, `getVueInternalName`, `isSyntheticEvent` in normalize.ts and safeJoin are framework-specific but always bundled. Could use a registration pattern.

## Medium Impact (Needs Investigation)
- **Simplify getDynamicSamplingContextFromSpan**: 3.1KB unminified, handles both core spans and OpenTelemetry trace state. The OTel path could be stripped in browser-only bundles if guarded by a flag.
- **ITEM_TYPE_TO_DATA_CATEGORY_MAP optimization**: 18-entry lookup object. Some entries are only used by Node/server packages. Could be split into a base map + extensions.
- **Reduce supportsNativeFetch duplication**: Both `supportsNativeFetch` and `getNativeImplementation` create iframes to check for native fetch. Could consolidate into a single implementation.

## Already Exhausted
- Terser config fully optimized (passes:5, ecma:2020, toplevel, unsafe_arrows, unsafe_methods, unsafe_comps, unsafe_math, pure_getters, mangle.toplevel)
- String constant extraction doesn't help — gzip already compresses repeated patterns well
- Self-mapping object entries (key===value) don't save gzip bytes despite saving raw bytes
- Shorthand properties — terser already converts these
- DEFAULT_IGNORE_ERRORS pattern shortening — no gzip improvement
- `for...in` + `hasOwnProperty` → `Object.values().find()` — helps slightly but only 4 remaining sites are legitimate
- CDN bundle shim warning strings are intentional (production warnings for missing features)
