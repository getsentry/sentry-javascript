# PR Review Guidelines for Cursor Bot

You are reviewing a pull request for the Sentry JavaScript SDK.
Flag any of the following indicators or missing requirements.
If you find anything to flag, mention that you flagged this in the review because it was mentioned in this rules file.
These issues are only relevant for production code.
Do not flag the issues below if they appear in tests.

## Critical Issues to Flag

### Security Vulnerabilities

- Exposed secrets, API keys, tokens or creentials in code or comments
- Unsafe use of `eval()`, `Function()`, or `innerHTML`
- Unsafe regular expressions that could cause ReDoS attacks

### Breaking Changes

- Public API changes without proper deprecation notices
- Removal of publicly exported functions, classes, or types. Internal removals are fine!
- Changes to function signatures in public APIs

## SDK-relevant issues

### Performance Issues

- Multiple loops over the same array (for example, using `.filter`, .`foreach`, chained). Suggest a classic `for` loop as a replacement.
- Memory leaks from event listeners, timers, or closures not being cleaned up or unsubscribing
- Large bundle size increases in browser packages. Sometimes they're unavoidable but flag them anyway.

### Auto instrumentation, SDK integrations, Sentry-specific conventions

- When calling any `startSpan` API (`startInactiveSpan`, `startSpanManual`, etc), always ensure that the following span attributes are set:
  - `SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN` (`'sentry.origin'`) with a proper span origin
  - `SEMANTIC_ATTRIBUTE_SENTRY_OP` (`'sentry.op'`) with a proper span op
- When calling `captureException`, always make sure that the `mechanism` is set:
  - `handled`: must be set to `true` or `false`
  - `type`: must be set to a proper origin (i.e. identify the integration and part in the integration that caught the exception).
    - The type should align with the `SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN` if a span wraps the `captureException` call.
    - If there's no direct span that's wrapping the captured exception, apply a proper `type` value, following the same naming
      convention as the `SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN` value.
- When calling `startSpan`, check if error cases are handled. If flag that it might make sense to try/catch and call `captureException`.
- When calling `generateInstrumentationOnce`, the passed in name MUST match the name of the integration that uses it. If there are more than one instrumentations, they need to follow the pattern `${INSTRUMENTATION_NAME}.some-suffix`.
