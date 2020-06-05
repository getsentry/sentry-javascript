# Changelog

## Unreleased

- "You miss 100 percent of the chances you don't take. — Wayne Gretzky" — Michael Scott
- [react] feat: Add @sentry/react package (#2631)
- [react] feat: Add Error Boundary component (#2647)

## 5.17.0

- [browser] feat: Support `fetchParameters` (#2567)
- [apm] feat: Report LCP metric on pageload transactions (#2624)
- [core] fix: Normalize Transaction and Span consistently (#2655)
- [core] fix: Handle DSN qs and show better error messages (#2639)
- [browser] fix: Change XHR instrumentation order to handle `onreadystatechange` breadcrumbs correctly (#2643)
- [apm] fix: Re-add TraceContext for all events (#2656)
- [integrations] fix: Change Vue interface to be inline with the original types (#2634)
- [apm] ref: Use startTransaction where appropriate (#2644)

## 5.16.1

- [node] fix: Requests to old `/store` endpoint need the `x-sentry-auth` header in node (#2637)

## 5.16.0

*If you are a `@sentry/apm` and did manual instrumentation using `hub.startSpan` please be aware of the changes we did
to the API. The recommended entry point for manual instrumentation now is `Sentry.startTransaction` and creating
child Span by calling `startChild` on it. We have internal workarounds in place so the old code should still work
but will be removed in the future. If you are only using the `Tracing` integration there is no need for action.*

- [core] feat: Send transactions in envelopes (#2553)
- [core] fix: Send event timestamp (#2575)
- [browser] feat: Allow for configuring TryCatch integration (#2601)
- [browser] fix: Call wrapped `RequestAnimationFrame` with correct context (#2570)
- [node] fix: Prevent reading the same source file multiple times (#2569)
- [integrations] feat: Vue performance monitoring (#2571)
- [apm] fix: Use proper type name for op (#2584)
- [core] fix: sent_at for envelope headers to use same clock (#2597)
- [apm] fix: Improve bundle size by moving span status to @sentry/apm (#2589)
- [apm] feat: No longer discard transactions instead mark them deadline exceeded (#2588)
- [apm] feat: Introduce `Sentry.startTransaction` and `Transaction.startChild` (#2600)
- [apm] feat: Transactions no longer go through `beforeSend` (#2600)
- [browser] fix: Emit Sentry Request breadcrumbs from inside the client (#2615)
- [apm] fix: No longer debounce IdleTransaction (#2618)
- [apm] feat: Add pageload transaction option + fixes (#2623)
- [minimal/core] feat: Allow for explicit scope through 2nd argument to `captureException/captureMessage` (#2627)

## 5.15.5

- [browser/node] Add missing `BreadcrumbHint` and `EventHint` types exports (#2545)
- [utils] fix: Prevent `isMatchingPattern` from failing on invalid input (#2543)

## 5.15.4

- [node] fix: Path domain onto global extension method to not use require (#2527)

## 5.15.3

- [hub] fix: Restore dynamicRequire, but for `perf_hooks` only (#2524)

## 5.15.2

- [hub] fix: Remove dynamicRequire, Fix require call (#2521)

## 5.15.1

- [browser] fix: Prevent crash for react native instrumenting fetch (#2510)
- [node] fix: Remove the no longer required dynamicRequire hack to fix scope memory leak (#2515)
- [node] fix: Guard against invalid req.user input (#2512)
- [node] ref: Move node version to runtime context (#2507)
- [utils] fix: Make sure that SyncPromise handler is called only once (#2511)

## 5.15.0

- [apm] fix: Sampling of traces work now only depending on the client option `tracesSampleRate` (#2500)
- [apm] fix: Remove internal `forceNoChild` parameter from `hub.startSpan` (#2500)
- [apm] fix: Made constructor of `Span` internal, only use `hub.startSpan` (#2500)
- [apm] ref: Remove status from tags in transaction (#2497)
- [browser] fix: Respect breadcrumbs sentry:false option (#2499)
- [node] ref: Skip body parsing for GET/HEAD requests (#2504)

## 5.14.2

- [apm] fix: Use Performance API for timings when available, including Web Workers (#2492)
- [apm] fix: Remove Performance references (#2495)
- [apm] fix: Set `op` in node http.server transaction (#2496)

## 5.14.1

- [apm] fix: Check for performance.timing in webworkers (#2491)
- [apm] ref: Remove performance clear entry calls (#2490)

## 5.14.0

- [apm] feat: Add a simple heartbeat check, if activities don't change in 3 beats, finish the transaction (#2478)
- [apm] feat: Make use of the `performance` browser API to provide better instrumentation (#2474)
- [browser] ref: Move global error handler + unhandled promise rejection to instrument (#2475)
- [apm] ref: Always use monotonic clock for time calculations (#2485)
- [apm] fix: Add trace context to all events (#2486)

## 5.13.2

- [apm] feat: Add `discardBackgroundSpans` to discard background spans by default

## 5.13.1

- [node] fix: Restore engines back to `>= 6`

## 5.13.0

- [apm] feat: Add `options.autoPopAfter` parameter to `pushActivity` to prevent never-ending spans (#2459)
- [apm] fix: Use monotonic clock to compute durations (#2441)
- [core] ref: Remove unused `sentry_timestamp` header (#2458)
- [node] ref: Drop Node v6, add Node v12 to test matrix, move all scripts to Node v12 (#2455)
- [utils] ref: Prevent instantiating unnecessary Date objects in `timestampWithMs` (#2442)
- [browser] fix: Mark transactions as event.transaction in breadcrumbs correctly

## 5.12.5

- [browser] ref: Mark transactions as event.transaction in breadcrumbs (#2450)
- [node] fix: Dont overwrite servername in requestHandler (#2449)
- [utils] ref: Move creation of iframe into try/catch in fetch support check (#2447)

## 5.12.4

- [browser] ref: Rework XHR wrapping logic to make sure it always triggers (#2438)
- [browser] fix: Handle PromiseRejectionEvent-like CustomEvents (#2429)
- [core] ref: Notify user when event failed to deliver because of digestion pipeline issue (#2416)
- [node] fix: Improve incorrect `ParseRequest` typing (#2433)
- [apm] fix: Remove auto unknown_error transaction status (#2440)
- [apm] fix: Properly remove undefined keys from apm payload (#2414)

## 5.12.3

- [apm] fix: Remove undefined keys from trace.context (#2413)

## 5.12.2

- [apm] ref: Check if Tracing integration is enabled before dropping transaction

## 5.12.1

- [apm] ref: If `maxTransactionTimeout` = `0` there is no timeout (#2410)
- [apm] fix: Make sure that the `maxTransactionTimeout` is always enforced on transaction events (#2410)
- [browser] fix: Support for Hermes stacktraces (#2406)

## 5.12.0

- [core] feat: Provide `normalizeDepth` option and sensible default for scope methods (#2404)
- [browser] fix: Export `EventHint` type (#2407)

## 5.11.2

- [apm] fix: Add new option to `Tracing` `maxTransactionTimeout` determines the max length of a transaction (#2399)
- [hub] ref: Always also set transaction name on the top span in the scope
- [core] fix: Use `event_id` from hint given by top-level hub calls

## 5.11.1

- [apm] feat: Add build bundle including @sentry/browser + @sentry/apm
- [utils] ref: Extract adding source context incl. tests

## 5.11.0

- [apm] fix: Always attach `contexts.trace` to finished transaction (#2353)
- [integrations] fix: Make RewriteFrame integration process all exceptions (#2362)
- [node] ref: Update agent-base to 5.0 to remove http/s patching (#2355)
- [browser] feat: Set headers from options in XHR/fetch transport (#2363)

## 5.10.2

- [browser] fix: Always trigger default browser onerror handler (#2348)
- [browser] fix: Restore correct `functionToString` behavior for updated `fill` method (#2346)
- [integrations] ref: Allow for backslashes in unix paths (#2319)
- [integrations] feat: Support Windows-style path in RewriteFrame iteratee (#2319)

## 5.10.1

- [apm] fix: Sent correct span id with outgoing requests (#2341)
- [utils] fix: Make `fill` and `wrap` work nicely together to prevent double-triggering instrumentations (#2343)
- [node] ref: Require `https-proxy-agent` only when actually needed (#2334)

## 5.10.0

- [hub] feat: Update `span` implementation (#2161)
- [apm] feat: Add `@sentry/apm` package
- [integrations] feat: Change `Tracing` integration (#2161)
- [utils] feat: Introduce `instrument` util to allow for custom handlers
- [utils] Optimize `supportsNativeFetch` with a fast path that avoids DOM I/O (#2326)
- [utils] feat: Add `isInstanceOf` util for safety reasons

## 5.9.1

- [browser] ref: Fix regression with bundle size

## 5.9.0

- [node] feat: Added `mode` option for `OnUnhandledRejection` integration that changes how we log errors and what we do with the process itself
- [browser] ref: Both global handlers now always return `true` to call default implementations (error logging)

## 5.8.0

- [browser/node] feat: 429 http code handling in node/browser transports (#2300)
- [core] feat: Make sure that Debug integration is always setup as the last one (#2285)
- [browser] fix: Gracefuly handle incorrect input from onerror (#2302)
- [utils] fix: Safer normalizing for input with `domain` key (#2305)
- [utils] ref: Remove dom references from utils for old TS and env interop (#2303)

## 5.7.1

- [core] ref: Use the smallest possible interface for our needs - `PromiseLike` (#2273)
- [utils] fix: Add TS dom reference to make sure its in place for compilation (#2274)

## 5.7.0

- [core] ref: Use `Promise` as the interface, but `SyncPromise` as the implementation in all the places we need `thenable` API
- [browser] fix: Capture only failed `console.assert` calls
- [browser] ref: Major `TraceKit` and `GlobalHandlers` refactor
- [browser] ref: Remove _all_ required IE10-11 polyfills
- [browser] ref: Remove `Object.assign` method usage
- [browser] ref: Remove `Number.isNaN` method usage
- [browser] ref: Remove `includes` method usage
- [browser] ref: Improve usage of types in `addEventListener` breadcrumbs wrapper
- [browser] ci: Use Galaxy S9 Plus for Android 9
- [browser] ci: Increase timeouts and retries between Travis and BrowserStack
- [node] fix: Update https-proxy-agent to 3.0.0 for security reasons (#2262)
- [node] feat: Extract prototyped data in `extractUserData` (#2247)
- [node] ref: Use domain Hub detection only in Node environment
- [integrations] feat: Use `contexts` to handle ExtraErrorData (#2208)
- [integrations] ref: Remove `process.env.NODE_ENV` from Vue integration (#2263)
- [types] fix: Breadcrumb `data` needs to be an object
- [utils] ref: Make `Event` instances somewhat serializeable

## 5.6.3

- [browser] fix: Don't capture our own XHR events that somehow bubbled-up to global handler

## 5.6.2

- [browser] feat: Use framesToPop for InvaliantViolations in React errors (#2204)
- [browser] fix: Apply crossorigin attribute with setAttribute tag for userReport dialog (#2196)
- [browser] fix: Make sure that falsy values are captured in unhandledrejections (#2207)
- [loader] fix: Loader should also retrigger falsy values as errors (#2207)

## 5.6.1

- [core] fix: Correctly detect when client is enabled before installing integrations (#2193)
- [browser] ref: Loosen typings in `wrap` method

## 5.6.0

- [core] fix: When using enabled:false integrations shouldnt be installed (#2181)
- [browser] feat: Add support for custom schemes to Tracekit
- [browser] ref: Return function call result from `wrap` method
- [browser] ref: Better UnhandledRejection messages (#2185)
- [browser] test: Complete rewrite of Browser Integration Tests (#2176)
- [node] feat: Add cookies as an optional property in the request handler (#2167)
- [node] ref: Unify method name casing in breadcrumbs (#2183)
- [integrations] feat: Add logErrors option to Vue integration (#2182)

## 5.5.0

- [core] fix: Store processing state for each `flush` call separately (#2143)
- [scope] feat: Generate hint if not provided in the Hub calls (#2142)
- [browser] feat: Read `window.SENTRY_RELEASE` to set release by default (#2132)
- [browser] fix: Don't call `fn.handleEvent.bind` if `fn.handleEvent` does not exist (#2138)
- [browser] fix: Correctly handle events that utilize `handleEvent` object (#2149)
- [node] feat: Provide optional `shouldHandleError` option for node `errorHandler` (#2146)
- [node] fix: Remove unsafe `any` from `NodeOptions` type (#2111)
- [node] fix: Merge `transportOptions` correctly (#2151)
- [utils] fix: Add polyfill for `Object.setPrototypeOf` (#2127)
- [integrations] feat: `SessionDuration` integration (#2150)

## 5.4.3

- [core] feat: Expose `Span` class
- [node] fix: Don't overwrite transaction on event in express handler

## 5.4.2

- [core] fix: Allow Integration<T> constructor to have arguments
- [browser] fix: Vue breadcrumb recording missing in payload
- [node] fix: Force agent-base to be at version 4.3.0 to fix various issues. Fix #1762, fix #2085
- [integrations] fix: Tracing integration fetch headers bug where trace header is not attached if there are no options.
- [utils] fix: Better native `fetch` detection via iframes. Fix #1601

## 5.4.1

- [integrations] fix: Tracing integration fetch headers bug.

## 5.4.0

- [global] feat: Exposed new simplified scope API. `Sentry.setTag`, `Sentry.setTags`, `Sentry.setExtra`, `Sentry.setExtras`, `Sentry.setUser`, `Sentry.setContext`

## 5.3.1

- [integrations] fix: Tracing integration CDN build.

## 5.3.0

- [browser] fix: Remove `use_strict` from `@sentry/browser`
- [utils] fix: Guard string check in `truncate`
- [browser] fix: TraceKit fix for eval frames

## 5.2.1

- [browser] feat: Expose `wrap` function in `@sentry/browser`
- [browser] feat: Added `onLoad` callback to `showReportDialog`
- [browser] fix: Use 'native code' as a filename for some frames

## 5.2.0

- [opentracing] ref: Removed opentracing package
- [integrations] feat: Add tracing integration
- [hub] feat: Add tracing related function to scope and hub (`Scope.startSpan`, `Scope.setSpan`, `Hub.traceHeaders`)
- [hub] feat: Add new function to Scope `setContext`
- [hub] feat: Add new function to Scope `setTransaction`
- [integrations] fix: Update ember integration to include original error in `hint` in `beforeSend`
- [integrations] fix: Ember/Vue fix integration

## 5.1.3

- [browser] fix: GlobalHandler integration sometimes receives Event objects as message: Fix #1949

## 5.1.2

- [browser] fix: Fixed a bug if Sentry was initialized multiple times: Fix #2043
- [browser] ref: Mangle more stuff, reduce bundle size
- [browser] fix: Support for ram bundle frames
- [node] fix: Expose lastEventId method

## 5.1.1

- [browser] fix: Breadcrumb Integration: Fix #2034

## 5.1.0

- [hub] feat: Add `setContext` on the scope
- [browser] fix: Breacrumb integration ui clicks
- [node] feat: Add `flushTimeout` to `requestHandler` to auto flush requests

## 5.0.8

- [core] fix: Don't disable client before flushing
- [utils] fix: Remove node types
- [hub] fix: Make sure all breadcrumbs have a timestamp
- [hub] fix: Merge event with scope breadcrumbs instead of only using event breadcrumbs

## 5.0.7

- [utils] ref: Move `htmlTreeAsString` to `@sentry/browser`
- [utils] ref: Remove `Window` typehint `getGlobalObject`
- [core] fix: Make sure that flush/close works as advertised
- [integrations] feat: Added `CaptureConsole` integration

## 5.0.6

- [utils]: Change how we use `utils` and expose `esm` build
- [utils]: Remove `store` and `fs` classes -> moved to @sentry/electron where this is used
- [hub]: Allow to pass `null` to `setUser` to reset it

## 5.0.5

- [esm]: `module` in `package.json` now provides a `es5` build instead of `es2015`

## 5.0.4

- [integrations] fix: Not requiring angular types

## 5.0.3

- [hub] fix: Don't reset registry when there is no hub on the carrier #1969
- [integrations] fix: Export dedupe integration

## 5.0.2

- [browser] fix: Remove `browser` field from `package.json`

## 5.0.1

- [browser] fix: Add missing types

## 5.0.0

This major bump brings a lot of internal improvements. Also, we extracted some integrations out of the SDKs and put them
in their own package called `@sentry/integrations`. For a detailed guide how to upgrade from `4.x` to `5.x` refer to our
[migration guide](https://github.com/getsentry/sentry-javascript/blob/master/MIGRATION.md).

**Migration from v4**

If you were using the SDKs high level API, the way we describe it in the docs, you should be fine without any code
changes. This is a **breaking** release since we removed some methods from the public API and removed some classes from
the default export.

- **breaking** [node] fix: Events created from exception shouldn't have top-level message attribute
- [utils] ref: Update wrap method to hide internal sentry flags
- [utils] fix: Make internal Sentry flags non-enumerable in fill utils
- [utils] ref: Move `SentryError` + `PromiseBuffer` to utils
- **breaking** [core] ref: Use `SyncPromise` internally, this reduces memory pressure by a lot.
- ref: Move internal `ExtendedError` to a types package
- **breaking** [browser] ref: Removed `BrowserBackend` from default export.
- **breaking** [node] ref: Removed `BrowserBackend` from default export.
- **breaking** [core] feat: Disable client once flushed using `close` method
- **breaking** [core] ref: Pass `Event` to `sendEvent` instead of already stringified data
- [utils] feat: Introduce `isSyntheticEvent` util
- **breaking** [utils] ref: remove `isArray` util in favor of `Array.isArray`
- **breaking** [utils] ref: Remove `isNaN` util in favor of `Number.isNaN`
- **breaking** [utils] ref: Remove `isFunction` util in favor of `typeof === 'function'`
- **breaking** [utils] ref: Remove `isUndefined` util in favor of `=== void 0`
- **breaking** [utils] ref: Remove `assign` util in favor of `Object.assign`
- **breaking** [utils] ref: Remove `includes` util in favor of native `includes`
- **breaking** [utils] ref: Rename `serializeKeysToEventMessage` to `keysToEventMessage`
- **breaking** [utils] ref: Rename `limitObjectDepthToSize` to `normalizeToSize` and rewrite its internals
- **breaking** [utils] ref: Rename `safeNormalize` to `normalize` and rewrite its internals
- **breaking** [utils] ref: Remove `serialize`, `deserialize`, `clone` and `serializeObject` functions
- **breaking** [utils] ref: Rewrite normalization functions by removing most of them and leaving just `normalize` and
  `normalizeToSize`
- **breaking** [core] ref: Extract all pluggable integrations into a separate `@sentry/integrations` package
- **breaking** [core] ref: Move `extraErrorData` integration to `@sentry/integrations` package
- [core] feat: Add `maxValueLength` option to adjust max string length for values, default is 250.
- [hub] feat: Introduce `setExtras`, `setTags`, `clearBreadcrumbs`.
- **breaking** [all] feat: Move `Mechanism` to `Exception`
- [browser/node] feat: Add `synthetic` to `Mechanism` in exception.
- [browser/node] fix: Use `addExceptionTypeValue` in helpers
- [browser] ref: Remove unused TraceKit code
- **breaking** [all] build: Expose `module` in `package.json` as entry point for esm builds.
- **breaking** [all] build: Use `es6` target instead of esnext for ESM builds
- [all] feat: Prefix all private methods with `_`
- [all] build: Use terser instead of uglify
- [opentracing] feat: Introduce `@sentry/opentracing` providing functions to attach opentracing data to Sentry Events
- **breaking** [core] ref: `Dedupe` Integration is now optional, it is no longer enabled by default.
- **breaking** [core] ref: Removed default client fingerprinting for messages
- [node] ref: Remove stack-trace dependencies
- **breaking** [core] ref: Transport function `captureEvent` was renamed to `sendEvent`
- [node] fix: Check if buffer isReady before sending/creating Promise for request.
- [browser] fix: Remove beacon transport.
- [browser] fix: Don't mangle names starting with two `__`
- [utils] fix: Ensure only one logger instance
- [node] feat: Add esm build
- [integrations] feat: Fix build and prepare upload to cdn
- [integrations] fix: Bug in vue integration with `attachProps`
- **breaking** [core] ref: Remove SDK information integration
- **breaking** [core] ref: Remove `install` function on integration interface
- [node] feat: Add esm build
- [integrations] feat: Fix build and prepare upload to cdn
- [integrations] fix: Bug in vue integration with `attachProps`

## 5.0.0-rc.3

- [browser] fix: Don't mangle names starting with two `__`
- [utils] fix: Ensure only one logger instance

## 5.0.0-rc.2

- [browser] fix: Remove beacon transport.

## 5.0.0-rc.1

- [node] fix: Check if buffer isReady before sending/creating Promise for request.

## 5.0.0-rc.0

- Fix: Tag npm release with `next` to not make it latest

## 5.0.0-beta.2

- Fix: NPM release

## 5.0.0-beta1

**Migration from v4**

This major bump brings a lot of internal improvements. This is a **breaking** release since we removed some methods from
the public API and removed some classes from the default export.

- **breaking** [node] fix: Events created from exception shouldn't have top-level message attribute
- [utils] ref: Update wrap method to hide internal sentry flags
- [utils] fix: Make internal Sentry flags non-enumerable in fill utils
- [utils] ref: Move `SentryError` + `PromiseBuffer` to utils
- **breaking** [core] ref: Use `SyncPromise` internally, this reduces memory pressure by a lot.
- **breaking** [browser] ref: Removed `BrowserBackend` from default export.
- **breaking** [node] ref: Removed `BrowserBackend` from default export.
- **breaking** [core] feat: Disable client once flushed using `close` method
- ref: Move internal `ExtendedError` to a types package
- **breaking** [core] ref: Pass `Event` to `sendEvent` instead of already stringified data
- [utils] feat: Introduce `isSyntheticEvent` util
- **breaking** [utils] ref: remove `isArray` util in favor of `Array.isArray`
- **breaking** [utils] ref: Remove `isNaN` util in favor of `Number.isNaN`
- **breaking** [utils] ref: Remove `isFunction` util in favor of `typeof === 'function'`
- **breaking** [utils] ref: Remove `isUndefined` util in favor of `=== void 0`
- **breaking** [utils] ref: Remove `assign` util in favor of `Object.assign`
- **breaking** [utils] ref: Remove `includes` util in favor of native `includes`
- **breaking** [utils] ref: Rename `serializeKeysToEventMessage` to `keysToEventMessage`
- **breaking** [utils] ref: Rename `limitObjectDepthToSize` to `normalizeToSize` and rewrite its internals
- **breaking** [utils] ref: Rename `safeNormalize` to `normalize` and rewrite its internals
- **breaking** [utils] ref: Remove `serialize`, `deserialize`, `clone` and `serializeObject` functions
- **breaking** [utils] ref: Rewrite normalization functions by removing most of them and leaving just `normalize` and
  `normalizeToSize`
- **breaking** [core] ref: Extract all pluggable integrations into a separate `@sentry/integrations` package
- **breaking** [core] ref: Move `extraErrorData` integration to `@sentry/integrations` package
- [core] feat: Add `maxValueLength` option to adjust max string length for values, default is 250.
- [hub] feat: Introduce `setExtras`, `setTags`, `clearBreadcrumbs`.
- **breaking** [all] feat: Move `Mechanism` to `Exception`
- [browser/node] feat: Add `synthetic` to `Mechanism` in exception.
- [browser/node] fix: Use `addExceptionTypeValue` in helpers
- [browser] ref: Remove unused TraceKit code
- **breaking** [all] build: Expose `module` in `package.json` as entry point for esm builds.
- **breaking** [all] build: Use `es6` target instead of esnext for ESM builds
- [all] feat: Prefix all private methods with `_`
- [all] build: Use terser instead of uglify
- [opentracing] feat: Introduce `@sentry/opentracing` providing functions to attach opentracing data to Sentry Events
- **breaking** [core] ref: `Dedupe` Integration is now optional, it is no longer enabled by default.
- **breaking** [core] ref: Removed default client fingerprinting for messages
- [node] ref: Remove stack-trace dependencies
- **breaking** [core] ref: Transport function `captureEvent` was renamed to `sendEvent`

## 4.6.4

- [utils] fix: Prevent decycling from referencing original objects
- [utils] fix: Preserve correct name when wrapping
- [raven-node] test: Update raven-node tests for new node version

## 4.6.3

- [utils] fix: Normalize value before recursively walking down the tree
- [browser] ref: Check whether client is enabled for reportDialog and log instead of throw

## 4.6.2

- [utils] fix: Preserve function prototype when filling
- [utils] fix: use a static object as fallback of the global object
- [node] feat: Read from `SENTRY_RELEASE` and `SENTRY_ENVIRONMENT` if present

## 4.6.1

- [utils] fix: Patch `tslib_1__default` regression and add additional tests around it

## 4.6.0

- [loader] fix: Detect if `init` has been called in an onload callback
- [core] fix: Use correct frame for `inboundFilter` methods
- [core] ref: Multiple `init` calls have been changed to "latest wins" instead of "ignore all after first"
- [core] feat: Introduce `flush` method which currently is an alias for `close`
- [node] feat: If `options.dsn` is undefined when calling `init` we try to load it from `process.env.SENTRY_DSN`
- [node] feat: Expose `flush` and `close` on `Sentry.*`
- [node] feat: Add `sentry` to express error handler response which contains the `event_id` of the error

## 4.5.4

- [browser] fix: `DOMError` and `DOMException` should be error level events
- [browser] ref: Log error if Ember/Vue instances are not provided
- [utils] fix: Dont mutate original input in `decycle` util function
- [utils] fix: Skip non-enumerable properties in `decycle` util function
- [utils] ref: Update `wrap` method to hide internal Sentry flags
- [utils] fix: Make internal Sentry flags non-enumerable in `fill` util

## 4.5.3

- [browser]: fix: Fix UnhandledPromise: [object Object]
- [core]: fix: Error in extraErrorData integration where event would not be send in case of non assignable object
  property.
- [hub]: feat: Support non async event processors

## 4.5.2

- [utils] fix: Decycling for objects to no produce an endless loop
- [browser] fix: <unlabeled> event for unhandledRejection
- [loader] fix: Handle unhandledRejection the same way as it would be thrown

## 4.5.1

- [utils] fix: Don't npm ignore esm for utils

## 4.5.0

- [core] feat: Deprecate `captureEvent`, prefer `sendEvent` for transports. `sendEvent` now takes a string (body)
  instead of `Event` object.
- [core] feat: Use correct buffer for requests in transports
- [core] feat: (beta) provide esm build
- [core] ref: Change way how transports are initialized
- [core] ref: Rename `RequestBuffer` to `PromiseBuffer`, also introduce limit
- [core] ref: Make sure that captureMessage input is a primitive
- [core] fix: Check if value is error object in extraErrorData integration
- [browser] fix: Prevent empty exception values
- [browser] fix: Permission denied to access property name
- [node] feat: Add file cache for providing pre/post context in frames
- [node] feat: New option `frameContextLines`, if set to `0` we do not provide source code pre/post context, default is
  `7` lines pre/post
- [utils] fix: Use custom serializer inside `serialize` method to prevent circular references

## 4.4.2

- [node] Port memory-leak tests from raven-node
- [core] feat: ExtraErrorData integration
- [hub] ref: use safeNormalize on any data we store on Scope
- [utils] feat: Introduce safeNormalize util method to unify stored data
- [loader] Support multiple onLoad callbacks

## 4.4.1

- [core] Bump dependencies to remove flatmap-stream

## 4.4.0

- [node] HTTP(S) Proxy support
- [node] Expose lastEventId method
- [browser] Correctly detect and remove wrapped function frames

## 4.3.4

- [utils] fix: Broken tslib import - Fixes #1757

## 4.3.3

- [build] ref: Dont emit TypeScript helpers in every file separately
- [node] fix: Move stacktrace types from devDeps to deps as its exposed
- [browser] misc: Added browser examples page

## 4.3.2

- [browser] fix: Typings for npm package

## 4.3.1

- [browser] ref: Breadcrumbs will now be logged only to a max object depth of 2
- [core] feat: Filter internal Sentry errors from transports/sdk
- [core] ref: Better fingerprint handling
- [node] ref: Expose Parsers functions

## 4.3.0

- [browser]: Move `ReportingObserver` integration to "pluggable" making it an opt-in integration
- [utils]: Use node internal `path` / `fs` for `store.ts`

## 4.2.4

- [browser]: Use `withScope` in `Ember` integration instead of manual `pushPop/popScope` calls
- [browser] fix: rethrow errors in testing mode with `Ember` integration (#1696)
- [browser/node]: Fix `LinkedErrors` integration to send exceptions in correct order and take main exception into the
  `limit` count
- [browser/node] ref: Re-export `addGlobalEventProcessor`
- [core]: Fix `InboundFilters` integration so that it reads and merge configuration from the `init` call as well

## 4.2.3

- [utils]: `bundlerSafeRequire` renamed to `dynamicRequire` now takes two arguments, first is should be `module`, second
  `request` / `moduleName`.

## 4.2.2

- [core]: Several internal fixes regarding integration, exports and domain.
- [core]: "De-deprecate" name of `Integration` interface.
- [node]: Export `parseRequest` on `Handlers`.

## 4.2.1

- [core] Invert logger logic the explicitly enable it.
- [hub] Require `domain` in `getCurrentHub` in try/catch - Fixed #1670
- [hub] Removed exposed getter on the Scope.

## 4.2.0

- [browser] fix: Make `addBreadcrumb` sync internally, `beforeBreadcrumb` is now only sync
- [browser] fix: Remove internal `console` guard in `beforeBreadcrumb`
- [core] feat: Integrations now live on the `Client`. This means that when binding a new Client to the `Hub` the client
  itself can decide which integration should run.
- [node] ref: Simplify Node global handlers code

## 4.1.1

- [browser] fix: Use our own path utils instead of node built-ins
- [node] fix: Add colon to node base protocol to follow http module
- [utils] feat: Create internal path module

## 4.1.0

- [browser] feat: Better mechanism detection in TraceKit
- [browser] fix: Change loader to use getAttribute instead of dataset
- [browser] fix: Remove trailing commas from loader for IE10/11
- [browser] ref: Include md5 lib and transcript it to TypeScript
- [browser] ref: Remove all trailing commas from integration tests cuz IE10/11
- [browser] ref: Remove default transaction from browser
- [browser] ref: Remove redundant debug.ts file from browser integrations
- [browser] test: Fix all integration tests in IE10/11 and Android browsers
- [browser] test: Run integration tests on SauceLabs
- [browser] test: Stop running raven-js saucelabs tests in favour of @sentry/browser
- [browser] test: Store breadcrumbs in the global variable in integration tests
- [browser] test: Update polyfills for integration tests
- [build] ref: Use Mocha v4 instead of v5, as it's not supporting IE10
- [core] feat: Introduce stringify and debugger options in Debug integration
- [core] feat: RewriteFrames pluggable integration
- [core] feat: getRequestheaders should handle legacy DSNs
- [core] fix: correct sampleRate behaviour
- [core] misc: Warn user when beforeSend doesnt return an event or null
- [core] ref: Check for node-env first and return more accurate global object
- [core] ref: Remove Repo interface and repos attribute from Event
- [core] ref: Rewrite RequestBuffer using Array instead of Set for IE10/11
- [hub] fix: Scope level overwrites level on the event
- [hub] fix: Correctly store and retrieve Hub from domain when one is active
- [hub] fix: Copy over user data when cloning scope
- [node] feat: Allow requestHandler to be configured
- [node] feat: Allow pick any user attributes from requestHandler
- [node] feat: Make node transactions a pluggable integration with tests
- [node] feat: Transactions handling for RequestHandler in Express/Hapi
- [node] fix: Dont wrap native modules more than once to prevent leaks
- [node] fix: Add the same protocol as dsn to base transport option
- [node] fix: Use getCurrentHub to retrieve correct hub in requestHandler
- [utils] ref: implemented includes, assign and isNaN polyfills

## 4.0.6

- [browser] fix: Fallback to Error object when rejection `reason` is not available
- [browser] feat: Support Bluebird's `detail.reason` for promise rejections
- [types] fix: Use correct type for event's repos attribute

## 4.0.5

- [browser] ref: Expose `ReportDialogOptions`
- [browser] ref: Use better default message for ReportingObserver
- [browser] feat: Capture wrapped function arguments as extra
- [browser] ref: Unify integrations options and set proper defaults
- [browser] fix: Array.from is not available in old mobile browsers
- [browser] fix: Check for anonymous function before getting its name for mechanism
- [browser] test: Add loader + integration tests
- [core] ref: Move SDKInformation integration into core prepareEvent method
- [core] ref: Move debug initialization as the first step
- [node] fix: Make handlers types compatibile with Express
- [utils] fix: Dont break when non-string is passed to truncate
- [hub] feat: Add `run` function that makes `this` hub the current global one

## 4.0.4

- [browser] feat: Add `forceLoad` and `onLoad` function to be compatible with loader API

## 4.0.3

- [browser] feat: Better dedupe integration event description
- [core] ref: Move Dedupe, FunctionString, InboundFilters and SdkInformation integrations to the core package
- [core] feat: Provide correct platform and make a place to override event internals
- [browser] feat: UserAgent integration

## 4.0.2

- [browser] fix: Dont filter captured messages when they have no stacktraces

## 4.0.1

- [browser] feat: Show dropped event url in `blacklistUrl`/`whitelistUrl` debug mode
- [browser] feat: Use better event description instead of `event_id` for user-facing logs
- [core] ref: Create common integrations that are exposed on `@sentry/core` and reexposed through `browser`/`node`
- [core] feat: Debug integration
- [browser] ref: Port TraceKit to TypeScript and disable TraceKit's remote fetching for now

## 4.0.0

This is the release of our new SDKs, `@sentry/browser`, `@sentry/node`. While there are too many changes to list for
this release, we will keep a consistent changelog for upcoming new releases. `raven-js` (our legacy JavaScript/Browser
SDK) and `raven` (our legacy Node.js SDK) will still reside in this repo, but they will receive their own changelog.

We generally guide people to use our new SDKs from this point onward. The migration should be straightforward if you
were only using the basic features of our previous SDKs.

`raven-js` and `raven` will both still receive bugfixes but all the new features implemented will only work in the new
SDKs. The new SDKs are completely written in TypeScript, which means all functions, classes and properties are typed.

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

### Migration

Here are some examples of how the new SDKs work. Please note that the API for all JavaScript SDKs is the same.

#### Installation

_Old_:

```js
Raven.config('___PUBLIC_DSN___', {
  release: '1.3.0',
}).install();
```

_New_:

```js
Sentry.init({
  dsn: '___PUBLIC_DSN___',
  release: '1.3.0',
});
```

#### Set a global tag

_Old_:

```js
Raven.setTagsContext({ key: 'value' });
```

_New_:

```js
Sentry.configureScope(scope => {
  scope.setTag('key', 'value');
});
```

#### Capture custom exception

_Old_:

```js
try {
  throwingFunction();
} catch (e) {
  Raven.captureException(e, { extra: { debug: false } });
}
```

_New_:

```js
try {
  throwingFunction();
} catch (e) {
  Sentry.withScope(scope => {
    scope.setExtra('debug', false);
    Sentry.captureException(e);
  });
}
```

#### Capture a message

_Old_:

```js
Raven.captureMessage('test', 'info', { extra: { debug: false } });
```

_New_:

```js
Sentry.withScope(scope => {
  scope.setExtra('debug', false);
  Sentry.captureMessage('test', 'info');
});
```

#### Breadcrumbs

_Old_:

```js
Raven.captureBreadcrumb({
  message: 'Item added to shopping cart',
  category: 'action',
  data: {
    isbn: '978-1617290541',
    cartSize: '3',
  },
});
```

_New_:

```js
Sentry.addBreadcrumb({
  message: 'Item added to shopping cart',
  category: 'action',
  data: {
    isbn: '978-1617290541',
    cartSize: '3',
  },
});
```
