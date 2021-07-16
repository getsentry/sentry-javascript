# Changelog

## Unreleased

- "You miss 100 percent of the chances you don't take. — Wayne Gretzky" — Michael Scott


## 6.9.0

- feat(browser): Use scope data in report dialog (#3792)
- feat(core): Add `ensureNoCircularStructures` experiment to help debug serialization bugs (#3776)
- feat(nextjs): Add options to disable webpack plugin (#3771)
- feat(react): Support render props in `ErrorBoundary` (#3793)
- fix(ember): Correctly cache ember types from prepublish hook (#3749)
- fix(ember): Fix runtime config options not being merged (#3791)
- fix(metrics): Check for cls entry sources (#3775)
- fix(nextjs): Make `withSentryConfig` return type match given config type (#3760)
- fix(node): Check if `captureRequestSession` is available before its called (#3773)
- fix(node): Enable `autoSessionTracking` correctly (#3758)
- fix(react): `allRoutes` cannot triple equal a new array instance (#3779)
- fix(tracing): Add check for `document.scripts` in metrics (#3766)
- fix(types): Update `ExtractedNodeRequestData` to include valid `query_params` for `tracesSampler` (#3715)
- ref(gatsby): Default release to empty string (#3759)
- ref(nextjs): Inject init code in `_app` and API routes (#3786)
- ref(nextjs): Pre-disable-plugin-option config cleanup (#3770)
- ref(nextjs): Stop setting redundant `productionBrowserSourceMaps` in config (#3765)

## 6.8.0

- [browser] feat: Enable serialization of multiple DOM attributes for breadcrumbs. (#3755)
- [browser] feat: Make dedupe integration default for browser (#3730)
- [core] fix: Correctly limit Buffer requests (#3736)
- [ember] ref: Allow initing Ember without config entry (#3745)
- [serverless] fix: wrapEventFunction does not await for async code (#3740)

## 6.7.2

- [core] fix: Do not track sessions if not enabled (#3686)
- [core] fix: Prevent sending terminal status session updates (#3701)
- [core] ref: Make `beforeSend` more strict (#3713)
- [browser] ref: Log which request type has been limited (#3687)
- [nextjs] feat: Auto enable node http integration on server (#3675)
- [nextjs] fix: Correctly handle functional next config in `withSentryConfig` (#3698)
- [nextjs] fix: Fix conflict with other libraries modifying webpack `entry` property (#3703)
- [nextjs] fix: Update @sentry/webpack-plugin to 1.15.1 in @sentry/nextjs to resolve build timeouts issue (#3708)
- [nextjs] ref: Split up config code and add tests (#3693)

## 6.7.1

- [core] fix: Add event type to item header when envelopes are forced (#3676)
- [core] fix: Include DSN in envelope header for sessions (#3680)
- [core] fix: Prevent scope from storing more than 100 breadcrumbs at the time (#3677)
- [node] ref: Remove default http(s) import from http-module (#3681)
- [nextjs] feat: Add body data to transaction `request` context (#3672)

## 6.7.0

- [core] feat: Add `tunnel` option to support request tunneling for dealing with ad-blockers (#3521)

## 6.6.0

- [node] feat: Allow for overriding custom `UrlParser` in Node.js transports (#3612)
- [browser] feat: Add `serializeAttribute` option to DOM breadcrumbs. (#3620)
- [nextjs] fix: `Improve NextConfigExports` compatibility (#3592)
- [nextjs] fix: Use correct abs path for server init (#3649)
- [angular] fix: Do not run change detection when capturing the exception (#3618)
- [angular] fix: Do not run change detection when finishing transaction (#3622)
- [angular] fix: Provide a single compilation unit for the `trace` directive (#3617)
- [utils] fix: Check for `performance.now` when calculating browser timing (#3657)
- [integrations] fix: Run rewriting for both `exception` and `stacktrace` events (#3653)
- [node] ref: Replace old-style `require(console)` with a global object (#3623)
- [node] ref: Make `HTTPModule` more abstract to be able to use it in non-Node.JS environments (#3655)
- [nextjs] ref: Export `BrowserTracing` integration directly from `@sentry/nextjs` (#3647)

## 6.5.1

- [nextjs] fix: Prevent webpack 5 from crashing server (#3642)
- [eslint] build: Upgrade to eslint 7.27.0 (#3639)
- [nextjs] test: Add nextjs integration tests for Server and Browser (#3632)
- [browser] ref: Don't send session duration in browser environments (#3616)
- [hub] fix: Correctly compute session durations (#3616)

## 6.5.0

- [angular] fix: prevent memory leak when the root view is removed (#3594)
- [browser] fix: Do not trigger session on meaningless navigation (#3608)
- [nextjs] feat: Frontend + withSentry Performance Monitoring (#3580)
- [react] fix: Use history object for init transaction name (#3609)

## 6.4.1

- [ember] ref: Fix merging of runtime config with environment config. (#3563)
- [angular] ref: Allow angular v12 as a peer dependency. (#3569)
- [tracing] fix: Avoid browser tracing initialization on node environment (#3548)
- [react] ref: Make RouteProps typing more generic (#3570)
- [tracing] fix: Correctly handle pg.Cursor in pg query method (#3567)
- [types] fix: Add attachment to SentryRequestType (#3561)
- [nextjs] ref: Disable node session for next.js (#3558)
- [eslint] feat: Add new eslint rules (#3545)

## 6.4.0

- [core] feat: initialScope in SDK Options (#3544)
- [node] feat: Release Health for Node (Session Aggregates) (#3319)
- [node] feat: Autoload Database Integrations in Node environment (#3483)
- [react] feat: Add support for React 17 Error Boundaries (#3532)
- [tracing] fix: Generate TTFB (Time to first byte) from span data (#3515)

## 6.3.6

- [nextjs] fix: Fix error logging (#3512)
- [nextjs] fix: Add environment automatically (#3495)
- [node] feat: Implement category based rate limiting (#3435)
- [node] fix: Set handled to false when it is a crash (#3493)
- [tracing] fix: Mark tracing distributables as side effects (#3519)

## 6.3.5

- [nextjs] fix: Add tslib dependecy; change inject order (#3487)

## 6.3.4

- [nextjs] fix: API routes logging (#3479)

## 6.3.3

- [nextjs] fix: User server types (#3471)

## 6.3.2

- [nextjs] ref: Remove next.js plugin (#3462)
- [core] fix: Prevent InboundFilters mergeOptions method from breaking users code (#3458)

## 6.3.1

- [angular] fix: Make SentryErrorHandler extensible and export it publicly (#3438)
- [browser] feat: Capture information about the LCP element culprit (#3427)
- [core] fix: Correctly attach installed integrations to sdkinfo (#3447)
- [ember] fix: Add guards to ensure marks exist (#3436)
- [nextjs] fix: Fix incomplete merging of user config with Sentry config (#3434)
- [nextjs] ref: Use resolved paths for `require` calls in config code (#3426)
- [node] fix: Fix for manual tests in node (#3428)
- [transports] feat: Honor no_proxy env variable (#3412)

## 6.3.0

- [browser] feat: Parse safari-extension and safari-web-extension errors (#3374)
- [browser] fix: Provide better descriptions for the performance navigation timing spans (#3245)
- [browser] test: Replace Authorization with Accept header (#3400)
- [ci] ci: Add CodeQL scanning
- [core] Drop session if release is not a string or is missing and log (#3396)
- [docs] Document how to publish a new release (#3361)
- [gatsby] fix: Specify gatsby peer dep (#3385)
- [gatsby] chore(docs): Update @sentry/gatsby README (#3384)
- [integrations] feat(integrations): add prefix support for RewriteFrames (#3416)
- [integrations] ref: Use esm imports with localforage and add esModuleInterop (#3403)
- [nextjs] feat: Next.js SDK + Plugin (#3301)
- [node] fix: Generate a Sentry Release string from env if its not provided (#3393)
- [tracing] fix: Replace performance.timeOrigin in favour of browserPerformanceTimeOrigin (#3397)
- [tracing] fix: Mark span as failed when fetch API call fails (#3351)
- [utils] fix: Use the more reliable timeOrigin (#3398)
- [utils] fix: Wrap oldOnPopState.apply call in try/catch to prevent Firefox from crashing (#3377)

## 6.2.5

- [utils] fix: Avoid performance.timeOrigin if too skewed (#3356)

## 6.2.4

- [browser] fix: Add `SentryRequestType` to `RateLimitingCategory` mapping (#3328)
- [browser] ref: Add fast-path to `fetchImpl` and cleanup redundant iframe (#3341)
- [node] fix: Fallback to empty string if `req.baseUrl` is empty (#3329)
- [node] ref: Remove circular dependency in `@sentry/node` (#3335)
- [tracing] fix: Attach mysql tracing to `Connection.createQuery` instead of `Connection.prototype.query` (#3353)
- [tracing] ref: Clarify naming in `BrowserTracing` integration (#3338)
- [ember] ref: Fix tests to be forward compatible with component changes (#3347)
- [ember] ref: Silence deprecation warnings in beta (#3346)

## 6.2.3

- [gatsby] fix: Update Vercel environment variables to match their current system variables (#3337)

## 6.2.2

- [hub] fix: Only create sessions if the correct methods are defined (#3281)
- [core] fix: Don't override SDK metadata (#3304)
- [browser] fix: Prevent fetch errors loops with invalid fetch implementations (#3318)
- [serverless] ref: Add compatible runtime nodejs14.x to building awslambda layer (#3303)
- [ember] fix: Keep route hook context when performance-wrapping (#3274)
- [integrations] fix: Normalized Event before caching. (#3305)

## 6.2.1

- [core] fix: Moves SDK metadata-setting into the `NodeClient/BrowserClient` to protect it from being overwritten by other classes extending `BaseClient` like @sentry/serverless (#3279)

## 6.2.0

- [tracing] feat: Mongoose tracing support added to MongoDB (#3252)
- [tracing] fix: Add missing `find` method from mongo tracing list (#3253)
- [tracing] fix: Create `spanRecorder` whenever transactions are sampled (#3255)
- [node] fix: Parse ESM based frames with `file://` protocol (#3264)
- [react] fix: Remove react-dom peer dependency for RN (#3250)
- [ember] fix: Fixing fetching config during build step (#3246)
- [serverless]: fix: Handle incoming `sentry-trace` header (#3261)

## 6.1.0

We updated the way how we calculate errored and crashed sessions with this update. Please be aware that some numbers might change for you and they now should reflect the actual reality. Visit [our docs](https://docs.sentry.io/platforms/javascript/configuration/releases/#release-health) for more information.

- [browser] feat: Rework how we track sessions (#3224)
- [hub] ref: Simplify getting hub from active domain (#3227)
- [core] ref: Rename `user` to `publicKey` in `Dsn` type and class (#3225)
- [ember] fix: Fix backwards compatibility with Embroider changes (#3230)

## 6.0.4

- [browser] fix: Don't break when function call context is undefined (#3222)
- [tracing] fix: Set default sampling context data where `startTransaction` is called (#3210)
- [tracing] fix: Remove stray sampling data tags (#3197)
- [tracing] fix: Clear activeTransaction from the scope and always start idle timers (#3215)
- [angular] ref: Add Angular 11 to possible peerDependencies list (#3201)
- [vue] ref: Add `vue-router` to peerDependencies list (#3214)

## 6.0.3

- [tracing] ref: feat(tracing): Add context update methods to Span and Transaction (#3192)
- [node] ref: Make ExpressRequest not extend http.IncomingMessage anymore (#3211)
- [browser] deps: Allow for LocalForage >=1.8.1 (#3205)
- [ember] fix(ember): Fix location url for 'hash' location type (#3195)
- [ember] fix(ember): Fix Ember to work with Embroider and Fastboot (#3181)

## 6.0.2

- [browser] fix: Disable session tracking in non-browser environments (#3194)

## 6.0.1

- [vue] fix: Make sure that error is present before logging it in Vue (#3183)
- [serverless] fix: Fix issue when `/dist` didn't exist before building (#3190)

## 6.0.0

_This major version release doesn't contain any breaking API/code changes._ Starting from the version `6.0.0`, all SDKs
that support sending sessions data will do so by default. See our
[Release Health](https://docs.sentry.io/product/releases/health/) docs to learn more. As of this version, it applies to
all Browser SDKs (Browser, React, Angular, Vue, Gatsby etc.). Node.js and other related Server SDKs will follow soon
after, in the minor `6.x` release. You can opt-out of this behavior by setting `autoSessionTracking: false` option
during SDK initialization.

---

- [wasm] feat: Introduce a `@sentry/wasm` package (#3080)
- [tracing] feat: Turn Sessions Tracking on by default (#3099)
- [tracing] feat: Create session on history change (#3179)
- [core] feat: Attach SDK metadata to options and pass it to the API and transports (#3177)
- [build] feat: AWS Lambda layer target config for Craft (#3175)
- [tracing] fix: Make sure that mongo method is thenable before calling it (#3173)

## 5.30.0

- [node] fix: esbuild warning dynamic require (#3164)
- [tracing] ref: Expose required things for React Native auto tracing (#3144)
- [ember] fix: rootURL breaking route recognition (#3166)
- [serverless] feat: Zip serverless dependencies for AWS Lambda (#3110)
- [build] feat: Target to deploy on AWS Lambda (#3165)
- [build] ref: Remove TravisCI (#3149)
- [build] ref: Upgrade action-prepare-release to latest version

## 5.29.2

- Fix version

## 5.29.1

- [types] ref: Loosen tag types, create new `Primitive` type (#3108)
- [tracing] feat: Send sample rate and type in transaction item header in envelope (#3068)
- [tracing] fix(web-vitals): Fix TTFB capture in Safari (#3106)

## 5.29.0

- [tracing] feat: MongoDB Tracing Support (#3072)
- [tracing] feat: MySQL Tracing Support (#3088)
- [tracing] feat: PostgreSQL Tracing Support (#3064)
- [tracing] fix: Add `sentry-trace` header to outgoing http(s) requests in node (#3053)
- [node] fix: Revert express tracing integration type to use any (#3093)

## 5.28.0

- [browser] fix: Handle expo file dir stack frames (#3070)
- [vue] feat: @sentry/vue (#2953)
- [node] ref: Revamp express route info extraction (#3084)
- [browser] fix: Dont append dsn twice to report dialog calls (#3079)
- [ember] fix: Use correct import from `@sentry/browser` (#3077)
- [node] ref: Express integration span name change and path unification (#3078)

## 5.27.6

- [hub] fix: Don't invoke scope updates in scope listeners

## 5.27.5

- [hub] fix: Sync ScopeListeners (#3065)
- [tracing] fix: Typo in constant name in @sentry/tracing (#3058)

## 5.27.4

- [core] fix: Remove globalThis usage (#3033)
- [react] ref: Add React 17.x to peerDependencies (#3034)
- [tracing] fix: Express transaction name (#3048)
- [serverless] fix: AWS Execution duration (#3032)
- [serverless] fix: Add `optional` parameter to AWSServices integration (#3030)
- [serverless] fix: Wrap google cloud functions with a Proxy(). (#3035)
- [hub] fix: stop using @types/node in @sentry/hub (#3050)

## 5.27.3

- [hub] fix: Make sure that `getSession` exists before calling it (#3017)
- [browser] feat: Add `DOMException.code` as tag if it exists (#3018)
- [browser] fix: Call `removeEventListener` twice only when necessary (#3016)
- [tracing] fix: Schedule the execution of the finish to let all the spans being closed first (#3022)
- [tracing] fix: Adjust some web vitals to be relative to fetchStart and some other improvements (#3019)
- [tracing] fix: Add transaction name as tag on error events (#3024)

## 5.27.2

- [apm] ref: Delete sentry/apm package (#2990)
- [types] fix: make requestHandler options an own type (#2995)
- [core] fix: Use 'production' as default value for environment key (#3013)

## 5.27.1

- [hub] fix: Preserve original user data for explicitly updated scopes (#2991)
- [ember] fix: prevent unexpected errors on transition (#2988)

## 5.27.0

- [browser] feat: Sessions Health Tracking (#2973)
- [core] fix: Correct `processing` flag in `BaseClient` (#2983)
- [node] feat: use `req.cookies` if available instead of parsing (#2985)
- [core] ref: Use SentryError for `prepareEvent` rejections (#2973)
- [core] ref: Errors handling in `prepareEvent` pipeline (#2987)
- [serverless] feat: Implement tracing of Google Cloud Requests (#2981)
- [serverless] ref: Set global event processor and pass scope data for transactions (#2975)
- [tracing] feat: Add secure connect navigation timing (#2980)
- [tracing] feat: Capture time spent redirecting before loading the current page (#2986)
- [tracing] feat: Capture browser navigator information (#2966)
- [tracing] feat: Express router methods tracing (#2972)
- [tracing] ref: Only report FCP or FP if the page wasn't hidden prior to their instrumentation (#2979)

## 5.26.0

- [serverless] feat: Implement error handling and tracing for `Google Cloud Functions` (#2945)
- [serverless] feat: Enable tracing for `AWSLambda` (#2945)
- [serverless] feat: Add `AWSResources` integration (#2945)
- [browser] feat: Implement `X-Sentry-Rate-Limits` handling for transports (#2962)
- [tracing] feat: Add measurements support and web vitals (#2909)
- [tracing] feat: Add web vitals: CLS and TTFB (#2964)
- [angular] ref: Make `@angular/common` a peerDependency instead of dependency (#2961)
- [ember] feat: Add more render instrumentation (#2902)
- [ember] ref: Use `@embroider/macros` instead of `runInDebug` (#2873)
- [hub] ref: Do not allow for popping last layer and unify getter methods (#2955)

## 5.25.0

- [tracing] fix: Expose `startTransaction` in CDN bundle (#2938)
- [tracing] fix: Allow unsampled transactions to be findable by `getTransaction()` (#2952)
- [tracing] fix: Reimplement timestamp computation (#2947)
- [tracing] ref: Clean up sampling decision inheritance (#2921) (#2944)
- [react] fix: Makes `normalizeTransactionName` take a callback function in router-v3 (#2946)
- [ember] feat: Add more render instrumentation to @sentry/ember (#2902)
- [types] ref: Use correct types for `event.context` and allow for context removal (#2910)
- [types] ref: Make name required on transaction class (#2949)
- [build] feat: Update to use extends w. Volta (#2930)

## 5.24.2

- [utils] fix: Check that performance is available before calling it in RN (#2924)

## 5.24.1

- [types] fix: Remove Location type to avoid dom lib dependency (#2922)

## 5.24.0

- [angular] fix: Make sure that message exist before returning it in angular error handler (#2903)
- [integrations] feat: Add referrer to data collected by UserAgent integration (#2912)
- [core] fix: Make sure that body is not exposed in the breadcrumb by default (#2911)
- [core] feat: Give access to XHR requests body in breadcrumb hint (#2904)
- [core] fix: Add a wrapper around performance for React Native (#2915)
- [integrations] fix: Make Vue tracing options optional (#2897)
- [integrations] ref: Remove unnecessary eventID check in offline integration (#2890)
- [tracing] feat: Add hook for trace sampling function to SDK options (#2820)

## 5.23.0

- [serverless] feat: Introduce `@sentry/serverless` with `AWSLambda` support (#2886)
- [ember] feat: Add performance instrumentation for routes (#2784)
- [node] ref: Remove query strings from transaction and span names (#2857)
- [angular] ref: Strip query and fragment from Angular tracing URLs (#2874)
- [tracing] ref: Simplify `shouldCreateSpanForRequest` (#2867)

## 5.22.3

- [integrations] fix: Window type (#2864)

## 5.22.2

- [integrations] fix: localforage typing (#2861)

## 5.22.1

- [integrations] fix: Add localforage typing (#2856)
- [tracing] fix: Make sure BrowserTracing is exported in CDN correctly (#2855)

## 5.22.0

- [browser] ref: Recognize `Capacitor` scheme as `Gecko` (#2836)
- [node]: fix: Save `string` exception as a message for `syntheticException` (#2837)
- [tracing] feat: Add `build` dir in npm package (#2846)
- [tracing] fix: Fix typo in `addPerformanceEntries` method name (#2847)
- [apm] ref: Deprecate `@sentry/apm` package (#2844)
- [angular] fix: Allow for empty DSN/disabling with `AngularJS` integration (#2842)
- [gatsby] ref: Make `@sentry/tracing` mandatory + add tests (#2841)
- [integrations] feat: Add integration for offline support (#2778)
- [utils] ref: Revert the usage of `globalThis` for `getGlobalObject` util (#2851)
- [build] fix: Lock in `TypeScript` to `3.7.5` (#2848)
- [build] misc: Upgrade `Prettier` to `1.19.0` (#2850)

## 5.21.4

- [ci] fix: Actually release correct code

## 5.21.3

- [tracing] feat: Track span status for fetch requests (#2835)
- [react] fix: Return an any from createReduxEnhancer to avoid type conflicts (#2834)
- [react] fix: Make sure profiler is typed with any (#2838)

## 5.21.2

- [tracing] fix: Normalize transaction names for express methods to match those of other SDKs (#2832)
- [tracing] feat: Change resource span op name and add data (#2816)
- [tracing] ref: Make sure error status is set on transactions (#2818)
- [apm/tracing] fix: Make sure Performance Observer takeRecords() is defined (#2825)

## 5.21.1

- [ember] fix: Make the package public and fix the build by bumping TypeScript to v3.9 (#2811)
- [eslint] test: Don't test eslint config/plugin on Node <= v8

## 5.21.0

- [all] feat: Convert `sentry-javascript` to `ESLint` (#2786)
- [internal/eslint] feat: Add `@sentry-internal/eslint-config-sdk` (#2807)
- [ember] feat: Add `@sentry/ember` (#2739)
- [angular] feat: Add `@sentry/angular` (#2787)
- [react] feat: Add routing instrumentation for `React Router v4/v5` (#2780)
- [gatsby] feat: support `process.env.SENTRY_RELEASE` (#2776)
- [apm/tracing] feat: Export `addExtensionMethods` for SDKs to use (#2805)
- [apm/tracing] ref: Remove `express` typing (#2803)
- [node] fix: `Retry-After` header in node should be lower-case (#2779)

## 5.20.1

- [core] ref: Expose sentry request for electron (#2774)
- [browser] fix: Make sure that DSN is always passed to report dialog (#2770)
- [apm/tracing] fix: Make sure fetch requests are being timed correctly (#2772)
- [apm/tracing] fix: Make sure pageload transactions start timestamps are correctly generated (#2773)
- [react] feat: Add instrumentation for React Router v3 (#2759)
- [react] ref: Use inline types to avoid redux dependency. (#2768)
- [node] fix: Set transaction on scope in node for request (#2769)

## 5.20.0

- [browser] feat: Make `@sentry/browser` more treeshakeable (#2747)
- [browser] fix: Make sure that handler exists in `LinkedErrors` integration (#2742)
- [tracing] feat: Introduce `@sentry/tracing` (#2719)
- [tracing] ref: Use `idleTimout` if no activities occur in idle transaction (#2752)
- [react] feat: Export `createReduxEnhancer` to log redux actions as breadcrumbs, and attach state as an extra. (#2717)
- [react] feat: Add `beforeCapture` option to ErrorBoundary (#2753)
- [react] fix: Change import of `hoist-non-react-statics` (#2755)
- [gatsby] fix: Make `@sentry/apm` optional in `@sentry/gatsby` package (#2752)

## 5.19.2

- [gatsby] fix: Include correct gatsby files in npm tarball (#2731)
- [browser] fix: Correctly detach event listeners (#2737)
- [browser] fix: Drop initial frame for production react errors (#2728)
- [node] chore: Upgrade https-proxy-agent to v5 (#2702)
- [types] ref: Define type for Extra(s) (#2727)

## 5.19.1

- [browser] fix: Correctly remove all event listeners (#2725)
- [tracing] fix: APM CDN bundle expose startTransaction (#2726)
- [tracing] fix: Add manual `DOMStringList` typing (#2718)

## 5.19.0

- [react] feat: Expose eventId on ErrorBoundary component (#2704)
- [node] fix: Extract transaction from nested express paths correctly (#2714)
- [tracing] feat: Pick up sentry-trace in JS <meta/> tag (#2703)
- [tracing] fix: Respect fetch headers (#2712) (#2713)
- [tracing] fix: Check if performance.getEntries() exists (#2710)
- [tracing] fix: Add manual Location typing (#2700)
- [tracing] fix: Respect sample decision when continuing trace from header in node (#2703)
- [tracing] fix: All options of adding fetch headers (#2712)
- [gatsby] fix: Add gatsby SDK identifier (#2709)
- [gatsby] fix: Package gatsby files properly (#2711)

## 5.18.1

- [react] feat: Update peer dependencies for `react` and `react-dom` (#2694)
- [react] ref: Change Profiler prop names (#2699)

## 5.18.0

- [core] ref: Rename `whitelistUrls/blacklistUrls` to `allowUrls/denyUrls` (#2671)
- [core] feat: Export `makeMain` (#2665)
- [core] fix: Call `bindClient` when creating new `Hub` to make integrations work automatically (#2665)
- [react] feat: Add @sentry/react package (#2631)
- [react] feat: Add Error Boundary component (#2647)
- [react] feat: Add useProfiler hook (#2659)
- [react] ref: Refactor Profiler to account for update and render (#2677)
- [gatsby] feat: Add @sentry/gatsby package (#2652)
- [apm] feat: Add ability to get span from activity using `getActivitySpan` (#2677)
- [apm] fix: Check if `performance.mark` exists before calling it (#2680)
- [tracing] feat: Add `scope.getTransaction` to return a Transaction if it exists (#2668)
- [tracing] ref: Deprecate `scope.setTransaction` in favor of `scope.setTransactionName` (#2668)
- [tracing] feat: Add `beforeNavigate` option (#2691)
- [tracing] ref: Create navigation transactions using `window.location.pathname` instead of `window.location.href`
  (#2691)

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

_If you are a `@sentry/apm` and did manual instrumentation using `hub.startSpan` please be aware of the changes we did
to the API. The recommended entry point for manual instrumentation now is `Sentry.startTransaction` and creating child
Span by calling `startChild` on it. We have internal workarounds in place so the old code should still work but will be
removed in the future. If you are only using the `Tracing` integration there is no need for action._

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

- [node] feat: Added `mode` option for `OnUnhandledRejection` integration that changes how we log errors and what we do
  with the process itself
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

- [core] ref: Use `Promise` as the interface, but `SyncPromise` as the implementation in all the places we need
  `thenable` API
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

- [global] feat: Exposed new simplified scope API. `Sentry.setTag`, `Sentry.setTags`, `Sentry.setExtra`,
  `Sentry.setExtras`, `Sentry.setUser`, `Sentry.setContext`

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
Sentry.configureScope((scope) => {
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
  Sentry.withScope((scope) => {
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
Sentry.withScope((scope) => {
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
