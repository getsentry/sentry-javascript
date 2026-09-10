---
name: add-ai-integration
description: Add a new AI provider integration to the Sentry JavaScript SDK. Use when contributing a new AI instrumentation (OpenAI, Anthropic, Vercel AI, LangChain, etc.) or modifying an existing one.
argument-hint: <provider-name>
---

# Adding a New AI Integration

## Read First

Do not invent span names, ops, or attributes — they are specified elsewhere and change independently of this repo:

- [Sentry gen_ai attributes](https://getsentry.github.io/sentry-conventions/attributes/gen_ai/) and [gen_ai ops](https://getsentry.github.io/sentry-conventions/ops/#gen_ai) — the normative list
- [RFC 0153: Decoupling Sentry's generative AI conventions from OpenTelemetry](https://github.com/getsentry/rfcs/blob/main/text/0153-decoupling-sentrys-generative-ai-conventions-from-open-telemetry.md) — why we diverge from OTel
- [OTel gen-ai semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) — the upstream baseline

In code: import attribute keys from `@sentry/conventions/attributes` and ops from `@sentry/conventions/op`. **Never hardcode either as a string.** Derive the op with `getGenAiSpanOp(operationName)` from `packages/server-utils/src/ai/core/utils.ts` rather than picking one by hand.

`packages/server-utils/src/ai/core/gen-ai-attributes.ts` holds only gap-fillers: attributes with no `@sentry/conventions` equivalent, Sentry-internal meta attributes, and keys we intentionally emit differently. Check conventions first; add there only if it genuinely has no equivalent.

## Decision Tree

```
Does the SDK publish its own `diagnostics_channel` telemetry?
|- YES (ai >= 7) -> Pattern 1: Native tracing channel
+- NO -> Does the SDK expose callback/exporter hooks?
    |- YES (LangChain, Mastra) -> Pattern 3: Callback/Exporter
    +- NO (OpenAI, Anthropic, Google GenAI, ai < 7) -> Pattern 2: Orchestrion-injected channels
```

## Placement

AI instrumentation lives in `packages/server-utils/`, not `packages/core/` and not the runtime packages:

- **Instrumentation logic** -> `packages/server-utils/src/ai/{provider}/`
- **Integration** (wires it up, registered in `getTracingIntegrations()`) -> `packages/server-utils/src/integrations/{provider}.ts`
- **Runtime packages** (`node`, `cloudflare`, `bun`, ...) re-export the integration from `@sentry/server-utils` — they do not define their own

Cloudflare-only client wrapping (Workers AI) is the exception: it is applied in `packages/cloudflare/src/instrumentations/worker/instrumentEnv.ts`, wrapping the binding from `env`.

## Pattern 1: Native Tracing Channel

**Use when:** the SDK publishes to `diagnostics_channel` itself (`ai` >= 7 publishes `ai:telemetry`)

Write the subscriber next to the integration, and subscribe from `setupOnce()` wrapped in `waitForTracingChannelBinding()` so it waits for the async-context binding. Subscribing is a no-op on SDK versions that never publish, so it is always safe to call.

Reference: `packages/server-utils/src/integrations/vercel-ai/vercel-ai-dc-subscriber.ts`

## Pattern 2: Orchestrion-Injected Channels

**Use when:** the SDK has no telemetry of its own (OpenAI, Anthropic, Google GenAI, `ai` < 7)

Orchestrion injects tracing channels into the target module's functions at load time; we subscribe to those injected channels. This replaced the old OTel instrumentation packages — there is no `@opentelemetry/instrumentation-*` dependency in this path.

1. Span-building/attribute logic in `packages/server-utils/src/ai/{provider}/`
2. Module, version range, and methods to inject in `packages/server-utils/src/orchestrion/config/{provider}.ts`
3. `invokeOrchestrionInstrumentation(...)` from `setup(client)` in the integration, binding each channel with `bindTracingChannelToSpan()`. Check `_INTERNAL_shouldSkipAiProviderWrapping()` for LangChain compatibility.

Reference: `packages/server-utils/src/integrations/openai.ts` + `packages/server-utils/src/orchestrion/config/openai.ts`

**A provider can need both patterns.** `vercelAIIntegration` subscribes to the native `ai:telemetry` channel for `ai` >= 7 _and_ runs orchestrion injection for `ai` v4-v6, in the same integration.

## Pattern 3: Callback/Exporter

**Use when:** the SDK provides lifecycle hooks or an exporter interface (LangChain, LangGraph, Mastra)

Implement the SDK's callback/exporter interface in `packages/server-utils/src/ai/{provider}/`, auto-inject it from the integration by patching the relevant methods, and call `_INTERNAL_skipAiProviderWrapping()` to disable the underlying AI provider wrapping.

Reference: `packages/server-utils/src/ai/langchain/`, and `packages/server-utils/src/ai/mastra/` for an exporter-shaped agent framework

## Streaming

How the span is opened depends on the path:

- **Channel path** (Patterns 1 & 2 — how auto-instrumentation actually runs): build the span with `startInactiveSpan()` inside the `getSpan` callback of `bindTracingChannelToSpan()` and let the binding own its lifecycle. For a streamed call, return `true` from `deferSpanEnd` to hand span-ending ownership to the stream wrapper; non-streaming results end through the normal `beforeSpanEnd` path. Detect the stream from the **result shape** (async-iterable, or the SDK's stream object), not from `params.stream`.
- **Manual client wrapping** (`instrumentOpenAiClient()`, `instrumentAnthropicAiClient()`, ... — the public manual-instrumentation API): non-streaming uses `startSpan()`; streaming uses `startSpanManual()` and detects via `params.stream === true`.

Either way, do not set streaming response attributes by hand: accumulate into a `StreamResponseState` and call `endStreamSpan(span, state, recordOutputs)` from `ai/core/utils.ts` — in a `finally` for an async generator, or from the stream's terminal event for a listener-based stream.

References: `ai/openai/streaming.ts` (async generator), `ai/anthropic-ai/streaming.ts` (event listeners), `integrations/openai.ts` and `integrations/anthropic.ts` (`wrapStreamResult()`)

## Registration

**Mandatory.** Patching only happens once the target package is imported (zero cost if unused).

1. **Add to `getTracingIntegrations()`** in `packages/server-utils/src/integrations/index.ts` — LangChain MUST come first, so it can disable the AI provider integrations before they instrument
2. **Export from `packages/server-utils/src/index.ts`**: integration function + options type
3. **Re-export from the runtime packages** that support it (e.g. `packages/node/src/index.ts`, `packages/cloudflare/src/index.ts`)
4. **Add E2E tests:** `dev-packages/node-integration-tests/suites/tracing/{provider}/`, `dev-packages/cloudflare-integration-tests/suites/tracing/{provider}/`

## Key Rules

1. Gate input/output message recording behind `resolveAIRecordingOptions()`, which resolves the integration's `recordInputs`/`recordOutputs` against the client's `dataCollection.genAI` settings. Never read `dataCollection.genAI` directly.
2. Set `SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN = 'auto.ai.{provider}'` (alphanumerics, `_`, `.` only)
3. **Do not truncate message payloads.** The `enableTruncation` flag and all AI truncation/media-stripping logic were removed in v11 (#23045); recorded messages are serialized with `stringify()` and set on the span as-is. Nothing downstream caps them either — `maxValueLength` only applies to `request.url` and exception values, and event normalization limits depth/breadth, not string length. Size limiting is handled server-side, so it is not a contributor concern.
4. Set token usage on the span the SDK reports it for, via `setTokenUsageAttributes()`. Do not roll child usage up onto parent spans — tree totals are computed product-side, from the full span tree. A rollup done at serialization time is impossible anyway under span streaming: each span is snapshotted to JSON when it ends (`captureSpan()`), and no transaction event is assembled, so there is no finished tree to walk.

## Checklist

- [ ] Instrumentation in `packages/server-utils/src/ai/`, integration in `packages/server-utils/src/integrations/`
- [ ] Added to `getTracingIntegrations()` in correct order (LangChain first)
- [ ] Exported from `packages/server-utils/src/index.ts` and re-exported from the supported runtime packages
- [ ] E2E tests added and verifying auto-instrumentation
- [ ] Attributes and ops taken from `@sentry/conventions`, with the op derived via `getGenAiSpanOp()`
- [ ] Input/output recording gated on `resolveAIRecordingOptions()`; no truncation logic added
- [ ] JSDoc on the exported integration names the channels it subscribes to, the supported SDK versions, and the prerequisite (orchestrion-injected channels "require the Sentry runtime hook or bundler plugin")
- [ ] Verified patching only happens when the target package is imported

**When in doubt, follow the pattern of the most similar existing integration.**
