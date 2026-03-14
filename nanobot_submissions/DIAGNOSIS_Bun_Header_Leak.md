# Diagnosis: Bun response headers leaked via transaction context (Set-Cookie exfiltration)

Issue: https://github.com/getsentry/sentry-javascript/issues/19790

## Root cause hypotheses
1. During Bun integration, response headers are being serialized into performance telemetry and attached to transaction payloads.
2. `getCapturedScopesOnSpan` stores data into `isolationScope` and this scope is merged into transaction context, potentially including headers.
3. The Bun HTTP transport or instrumentation may be attaching full `Response` headers (including `Set-Cookie`) to span/transaction metadata.

## Files likely needing modification
- `packages/bun/src/integrations/http.ts` (or equivalent Bun instrumentation file)
- `packages/core/src/tracing/transaction.ts`
- `packages/core/src/span.ts` (or where telemetry payloads are built)
- Any utility serializing headers to telemetry (e.g., `packages/utils/src/header.ts`)

## Verification steps
1. Reproduce by starting a Bun server with Sentry SDK and inspecting transaction payloads for presence of `response.headers` or `Set-Cookie`.
2. Add a debug logger before telemetry serialization to dump keys/values being attached to spans.
3. Confirm that removing header serialization or redacting `Set-Cookie` prevents leakage.

## Recommended minimal patch approach
- Before including response headers in telemetry, redact or exclude sensitive headers (`Set-Cookie`, `Authorization`, etc.).
- Ensure `getCapturedScopesOnSpan` does not merge raw response headers into scopes.

## Next actions
- Implement a redaction utility for response headers.
- Modify Bun HTTP integration to use this utility before attaching headers to spans.
- Add unit tests verifying no sensitive headers are present in captured telemetry.
