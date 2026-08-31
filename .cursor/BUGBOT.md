# PR Review Guidelines for Cursor Bot

You are reviewing a pull request for the Sentry JavaScript SDK.
Flag any of the following indicators or missing requirements.
If you find anything to flag, mention that you flagged this in the review because it was mentioned in this rules file.
Unless explicitly noted (e.g. in the `Testing Conventions` section), only flag the issues below in production code — ignore them in test files.

These rules operationalize the Sentry SDK [philosophy](https://develop.sentry.dev/sdk/getting-started/philosophy/) and [principles](https://develop.sentry.dev/sdk/getting-started/principles/): protect customer apps and data, prefer safe defaults, keep the base SDK lean, stay compatible, and never let SDK or callback failures become Sentry traffic or host crashes.

Keep reviews high-signal. Prefer actionable, high-confidence findings over speculative warnings or drive-by refactors unrelated to the diff.

## Critical Issues to Flag

### Security Vulnerabilities

- Exposed secrets, API keys, tokens, DSNs, or credentials in code, comments, logs, configs, or examples
- Unsafe use of `eval()`, `Function()`, or `innerHTML`
- Unsafe regular expressions that could cause ReDoS attacks
- PII or sensitive data attached by auto-instrumentation without an explicit opt-in (`sendDefaultPii` or equivalent). Flag new default logging/sending of request/response bodies, full URLs with query secrets, file paths, or device identifiers.
- Large or sensitive attachments enabled by default, or attachments lacking size limits / backoff
- Diagnostics, sampling overrides, verbose logging, or feature flags accidentally enabled in production defaults

### Breaking Changes

- Public API changes without proper deprecation notices
- Removal of publicly exported functions, classes, or types. Internal removals are fine!
- Changes to function signatures in public APIs
- Silent changes to defaults, sampling, or feature toggles that affect existing apps without migration notes
- Raising minimum runtime/browser/Node support, or dropping a supported platform, without an explicit docs/changelog/migration callout

## SDK-relevant issues

### Performance Issues

- Multiple loops over the same array (for example, chaining `.filter`, `.map`, `.forEach`). Suggest a classic `for` loop as a replacement.
- Memory leaks from event listeners, timers, or closures not being cleaned up / unsubscribed from
- Large bundle size increases in browser packages. Sometimes they're unavoidable but flag them anyway.
- Flag top-level side effects (function calls, mutations of module-level state, IIFEs) in modules that are reachable from a package's public entry points. Side effects defeat tree-shaking and inflate bundles for users who don't import the affected code. Pure exports (constants, classes, factory functions, side-effect-free declarations) are fine.

### Trust, defaults, and dependencies

- Never let SDK init or instrumentation failures crash or brick the host application. Prefer graceful degrade / no-op on unsupported or outdated environments; if that is impossible, the break must be obvious at install/build time, not at runtime.
- Flag new runtime dependencies on the base SDK path. Integration-only optional dependencies are fine when justified; baseline deps increase license, maintenance, and supply-chain surface.
- Flag new required configuration or integrations left disabled by default when auto-enable would give a better out-of-the-box experience without surprising side effects.
- Flag heavy in-SDK business logic that permanently reshapes wire-format data when collecting rawer data and leaving transformation to the server would do.
- SDKs must never `captureException` / `captureMessage` (or equivalent) for exceptions thrown inside the SDK itself or inside user callbacks such as `beforeSend` / `before_send`, `tracesSampler`, or similar hooks. Swallow gracefully and emit an error-level SDK log instead — capturing here can loop and take down the process. See [Never capture your own exceptions](https://develop.sentry.dev/sdk/getting-started/principles/#never-capture-your-own-exceptions).

### Auto instrumentation, SDK integrations, Sentry-specific conventions

- When calling any `startSpan` API (`startInactiveSpan`, `startSpanManual`, etc), always ensure that the following span attributes are set:
  - `SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN` (`'sentry.origin'`) with a proper span origin
    - a proper origin must only contain [a-z], [A-Z], [0-9], `_` and `.` characters.
    - flag any non-conforming origin values as invalid and link to the trace origin specification (https://develop.sentry.dev/sdk/telemetry/traces/trace-origin/)
  - `SEMANTIC_ATTRIBUTE_SENTRY_OP` (`'sentry.op'`) with a proper span op
    - Span ops should be lower case only, and use snake_case. The `.` character is used to delimit op parts.
    - flag any non-conforming op values as invalid and link to the span op specification (https://develop.sentry.dev/sdk/telemetry/traces/span-operations/)
- When calling `captureException`, always make sure that the `mechanism` is set:
  - `handled`: must be set to `true` or `false`
  - `type`: must be a proper identifier (i.e. identify the integration and part in the integration that caught the exception). The value should follow the same naming convention as `SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN`, and align with the surrounding span's origin when one exists.
- For automated structured logs, always set `sentry.origin` with a proper origin (same character rules as span origins).
- When calling any `startSpan` API, check how errors in the instrumented code are handled:
  - Generally, errors in instrumented code should be allowed to bubble up so the end user can handle them. If they remain unhandled, they will eventually be captured by Sentry through the SDK's global error handlers — so instrumentation code should typically **not** call `captureException` itself.
  - Only consider calling `captureException` if the instrumentation prevents errors from bubbling up (e.g. by swallowing them in a `try/catch` or an error event listener). Doing so is generally discouraged — prefer to let the error propagate instead.
  - Flag any instrumentation that swallows errors without calling `captureException`, and any instrumentation that calls `captureException` even though the error would still bubble up to the user (which causes double-reporting).
- When calling `generateInstrumentationOnce`, the passed in name MUST match the name of the integration that uses it. If there are multiple instrumentations, they need to follow the pattern `${INSTRUMENTATION_NAME}.some-suffix`.
- When SDK source code ends up in browser SDK output (ie. core/browser packages), flag any unguarded `debug.log` / `debug.warn` / `debug.error` calls. The convention is the short-circuit form `DEBUG_BUILD && debug.log(...)` (not `if (DEBUG_BUILD) { ... }` wrapping). Without the `DEBUG_BUILD` gate the message text ships in production bundles and bloats bundle size.
- Flag direct `console.log` / `console.warn` / `console.error` / `console.info` / `console.debug` calls in SDK source. The accepted patterns are:
  - The SDK's `debug` logger (gated with `DEBUG_BUILD && debug.*`) for SDK-internal diagnostics.
  - `consoleSandbox(() => { console.warn(...) })` for intentional user-facing warnings (e.g. init-time misconfiguration messages). The `consoleSandbox` wrapper prevents the SDK's own console instrumentation from intercepting the call. Bare `console.*` calls outside very early init paths (e.g. before the logger is available) should be flagged.
- Flag `url.full`, `url.query`, `http.target` or `request.query_string` being set from a URL that isn't filtered. Wrap the value in `filterCollectedUrl()` (or `filterCollectedUrlQuery()` for a bare query string), passing the `client` if one is in scope, so `dataCollection.urlQueryParams` applies. Values that can't contain a query (a bare pathname, a queue URL) are fine. The `sdk/no-unfiltered-url-attributes` lint rule catches direct attribute writes, so look for what it can't: URLs passed through a helper or variable first, deprecated aliases set next to a filtered attribute, and URLs on breadcrumbs or events instead of spans.
- Flag span names built from a raw URL. Names follow `METHOD scheme://host/path` and must never contain a query string, so they need `stripUrlQueryAndFragment()`, not `filterCollectedUrl()`.
- Flag usage of the following APIs: `getCurrentScope()`, `getIsolationScope()`, `getClient()` if they are avoidable. Flag it with severity Low and acknowledge from the start that this is more a "is this necessary" check, rather than a rule violation.
  - Reason for flagging: Usage of these APIs is problematic for multi-client setups where either there is no "current" client/scope, or the wrong client might be used. Calling these APIs would create a current scope, thereby misleading any future calls to these APIs.
  - What to do instead: Use an existing reference to the scope or client. For example, this is possible in most `Integration` hooks.
- Flag unnecessary `span.setAttribute(s)` calls: If data is already available at span start, it must be set via the `attributes` option of `startSpan`, `startSpanManual`, `startInactiveSpan` or `startIdleSpan` calls. This ensures that as much context as possible is available when `tracesSampler` or `ignoreSpans` SDK options are applied. If a `span.setAttribute(s)` call happens at a later time than right after span start and the attribute value can only be computed at that time, do not flag it.

### Code quality

- Flag new uses of `any`, `as any`, `as unknown as ...` double-casts, or non-null assertions (`!`) in SDK source. Each occurrence should have a comment explaining why a safer typing isn't possible; flag any that don't.

## Testing Conventions

- When reviewing a `feat` PR, check if the PR includes at least one integration or E2E test. If neither is present, flag it and recommend adding one.
- When reviewing a `fix` PR, check if the PR includes at least one unit, integration or E2E test that covers the regression this PR fixes. The test should fail without the fix and pass with it. If you cannot tell from the diff whether this is the case, ask the author to confirm. If no tests are present, flag it and recommend adding one.
- Check that tests actually test the newly added behaviour. Tests must prove user-visible or SDK behavior, not merely coverage or "did not throw".
  For instance, when checking on sent payloads by the SDK, ensure that the newly added data is asserted thoroughly.
  Hollow tests that look correct but assert nothing meaningful should be flagged.
- Flag usage of `expect.objectContaining` and other relaxed assertions, when a test expects something NOT to be included in a payload but there's no respective assertion.
- Flag usage of conditionals in one test and recommend splitting up the test for the different paths.
- Flag usage of loops testing multiple scenarios in one test and recommend using `(it)|(test).each` instead.
- Flag tests that are likely to introduce flakes. In our case this usually means we wait for some telemetry requests sent from an SDK. Patterns to look out for:
  - Only waiting for a request, after an action is performed. Instead, start waiting, perform action, await request promise.
  - Race conditions when waiting on multiple requests. Ensure that waiting checks are unique enough and don't depend on a hard order when there's a chance that telemetry can be sent in arbitrary order.
  - Timeouts or sleeps in tests. Instead suggest concrete events or other signals to wait on.
- Flag usage of `getFirstEnvelope*`, `getMultipleEnvelope*` or related test helpers in E2E tests. These are NOT reliable anymore. Instead suggest helpers like `waitForTransaction`, `waitForError`, `waitForSpans`, etc.
- Flag any new or modified `docker-compose.yml` under `dev-packages/node-integration-tests/suites/` where a service does not define a `healthcheck:`. The runner uses `docker compose up --wait` and relies on healthchecks to know when services are actually ready; without one the test will race the service's startup.

## Platform-safe code

- When any `setTimeout` or `setInterval` timers are started in a code path that can end up in server runtime packages (e.g. `@sentry/core` or `@sentry/node`), flag if neither `timeout.unref()` nor `safeUnref()` are called.
  Not unref'ing a timer can keep CLI-like applications or node scripts from exiting immediately, due to the process waiting on timers started by the SDK.
- Flag Node-only imports (`fs`, `path`, `child_process`, `os`, `net`, `http`, `https`, `node:*`, etc.) in code paths that ship to non-Node runtimes (`@sentry/browser`, `@sentry/cloudflare`, `@sentry/deno`, `@sentry/bun`, or shared code in `@sentry/core` / `@sentry/browser-utils` reachable from those entry points). When the dependency is unavoidable, isolate it behind a runtime check, dynamic `import()`, or a Node-only entry point — never at the top level of a cross-runtime module.

## What NOT to Flag

- Pure style or formatting that linters/formatters already own (Oxlint, Oxfmt, etc.)
- Speculative refactors or "improvements" with no clear user benefit or linked motivation
- Idiomatic monkeypatching / low-level hooks solely because they are brittle — only flag when unsafe, non-idempotent, or harmful to the host app
- Test-only issues unless covered by `Testing Conventions`
- Conventional commit / PR title format when CI already validates it
