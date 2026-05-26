# PR Review Guidelines for Cursor Bot

You are reviewing a pull request for the Sentry JavaScript SDK.
Flag any of the following indicators or missing requirements.
If you find anything to flag, mention that you flagged this in the review because it was mentioned in this rules file.
Unless explicitly noted (e.g. in the `Testing Conventions` section), only flag the issues below in production code — ignore them in test files.

## Critical Issues to Flag

### Security Vulnerabilities

- Exposed secrets, API keys, tokens or credentials in code or comments
- Unsafe use of `eval()`, `Function()`, or `innerHTML`
- Unsafe regular expressions that could cause ReDoS attacks

### Breaking Changes

- Public API changes without proper deprecation notices
- Removal of publicly exported functions, classes, or types. Internal removals are fine!
- Changes to function signatures in public APIs

## SDK-relevant issues

### Performance Issues

- Multiple loops over the same array (for example, chaining `.filter`, `.map`, `.forEach`). Suggest a classic `for` loop as a replacement.
- Memory leaks from event listeners, timers, or closures not being cleaned up / unsubscribed from
- Large bundle size increases in browser packages. Sometimes they're unavoidable but flag them anyway.

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
- When calling any `startSpan` API, check how errors in the instrumented code are handled:
  - Generally, errors in instrumented code should be allowed to bubble up so the end user can handle them. If they remain unhandled, they will eventually be captured by Sentry through the SDK's global error handlers — so instrumentation code should typically **not** call `captureException` itself.
  - Only consider calling `captureException` if the instrumentation prevents errors from bubbling up (e.g. by swallowing them in a `try/catch` or an error event listener). Doing so is generally discouraged — prefer to let the error propagate instead.
  - Flag any instrumentation that swallows errors without calling `captureException`, and any instrumentation that calls `captureException` even though the error would still bubble up to the user (which causes double-reporting).
- When calling `generateInstrumentationOnce`, the passed in name MUST match the name of the integration that uses it. If there are multiple instrumentations, they need to follow the pattern `${INSTRUMENTATION_NAME}.some-suffix`.

## Testing Conventions

- When reviewing a `feat` PR, check if the PR includes at least one integration or E2E test. If neither is present, flag it and recommend adding one.
- When reviewing a `fix` PR, check if the PR includes at least one unit, integration or E2E test that covers the regression this PR fixes. The test should fail without the fix and pass with it. If you cannot tell from the diff whether this is the case, ask the author to confirm. If no tests are present, flag it and recommend adding one.
- Check that tests actually test the newly added behaviour.
  For instance, when checking on sent payloads by the SDK, ensure that the newly added data is asserted thoroughly.
- Flag usage of `expect.objectContaining` and other relaxed assertions, when a test expects something NOT to be included in a payload but there's no respective assertion.
- Flag usage of conditionals in one test and recommend splitting up the test for the different paths.
- Flag usage of loops testing multiple scenarios in one test and recommend using `(it)|(test).each` instead.
- Flag tests that are likely to introduce flakes. In our case this usually means we wait for some telemetry requests sent from an SDK. Patterns to look out for:
  - Only waiting for a request, after an action is performed. Instead, start waiting, perform action, await request promise.
  - Race conditions when waiting on multiple requests. Ensure that waiting checks are unique enough and don't depend on a hard order when there's a chance that telemetry can be sent in arbitrary order.
  - Timeouts or sleeps in tests. Instead suggest concrete events or other signals to wait on.
- Flag usage of `getFirstEnvelope*`, `getMultipleEnvelope*` or related test helpers in E2E tests. These are NOT reliable anymore. Instead suggest helpers like `waitForTransaction`, `waitForError`, `waitForSpans`, etc.
- Flag any new or modified `docker-compose.yml` under `dev-packages/node-integration-tests/suites/` or `dev-packages/node-core-integration-tests/suites/` where a service does not define a `healthcheck:`. The runner uses `docker compose up --wait` and relies on healthchecks to know when services are actually ready; without one the test will race the service's startup.

## Platform-safe code

- When any `setTimeout` or `setInterval` timers are started in a code path that can end up in server runtime packages (e.g. `@sentry/core` or `@sentry/node`), flag if neither `timeout.unref()` nor `safeUnref()` are called.
  Not unref'ing a timer can keep CLI-like applications or node scripts from exiting immediately, due to the process waiting on timers started by the SDK.
