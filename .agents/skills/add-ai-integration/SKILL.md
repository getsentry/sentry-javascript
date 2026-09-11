---
name: add-ai-integration
description: Add a new AI provider integration to the Sentry JavaScript SDK. Use when contributing a new AI instrumentation (OpenAI, Anthropic, Vercel AI, LangChain, etc.) or modifying an existing one.
argument-hint: <provider-name>
---

# Adding a New AI Integration

## Conventions First

Span ops and attributes are specified outside this repo. Never invent or hardcode either:

- [gen_ai attributes](https://getsentry.github.io/sentry-conventions/attributes/gen_ai/) and [gen_ai ops](https://getsentry.github.io/sentry-conventions/ops/#gen_ai) — normative; import from `@sentry/conventions/attributes` and `@sentry/conventions/op`
- [RFC 0153](https://github.com/getsentry/rfcs/blob/main/text/0153-decoupling-sentrys-generative-ai-conventions-from-open-telemetry.md) — why Sentry's gen-AI conventions diverge from the [OTel gen-ai semconv](https://opentelemetry.io/docs/specs/semconv/gen-ai/)

Derive the op with `getGenAiSpanOp()` from `ai/core/utils.ts` rather than picking one by hand. `ai/core/gen-ai-attributes.ts` is for gap-fillers only — keys with no `@sentry/conventions` equivalent — so check it last, not first.

## Which Pattern

```
Does the SDK publish its own `diagnostics_channel` telemetry?
|- YES (ai >= 7) -> Pattern 1: Native tracing channel
+- NO -> Does the SDK expose callback/exporter hooks?
    |- YES (LangChain, Mastra) -> Pattern 3: Callback/Exporter
    +- NO (OpenAI, Anthropic, Google GenAI, ai < 7) -> Pattern 2: Orchestrion-injected channels
```

| Pattern                    | Use when                                   | Reference                                                       |
| -------------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| 1 — Native tracing channel | the SDK publishes to `diagnostics_channel` | `integrations/vercel-ai/vercel-ai-dc-subscriber.ts`             |
| 2 — Orchestrion channels   | the SDK has no telemetry of its own        | `integrations/openai.ts` + `orchestrion/config/openai.ts`       |
| 3 — Callback/exporter      | the SDK exposes hooks or an exporter       | `ai/langchain/`, `ai/mastra/` (exporter-shaped agent framework) |

What the reference files won't tell you:

- A provider can need two patterns at once: `vercelAIIntegration` subscribes to native `ai:telemetry` for `ai` >= 7 _and_ runs orchestrion injection for v4-v6.
- Pattern 1 subscribers are safe to register unconditionally — subscribing is a no-op on SDK versions that never publish.

## Where The Code Goes

- **Instrumentation** -> `packages/server-utils/src/ai/{provider}/`
- **Integration** -> `packages/server-utils/src/integrations/{provider}.ts`
- Runtime packages (`node`, `cloudflare`, `bun`, ...) re-export from `@sentry/server-utils` — they never define their own
- Exception: Workers AI is client-wrapped in `packages/cloudflare/src/instrumentations/worker/instrumentEnv.ts`

## Gotchas

1. **Detect streaming from the result shape** — an async-iterable or the SDK's stream object — not from `params.stream`. Only the manual `instrument{Provider}Client()` API keys off `params.stream === true`.
2. **Never set streamed response attributes by hand.** Accumulate into a `StreamResponseState` and call `endStreamSpan()` (`ai/openai/streaming.ts` for an async generator, `ai/anthropic-ai/streaming.ts` for a listener-based stream).
3. **Never truncate message payloads.** Truncation was removed in v11 (#23045) and nothing downstream caps them; size limiting is server-side.
4. **Never roll child token usage up onto parent spans.** Tree totals are computed product-side from the full span tree.
5. **Never read `dataCollection.genAI` directly.** Gate input/output recording on `resolveAIRecordingOptions()`.
6. **LangChain must be registered first** in `getTracingIntegrations()`, so it can disable the provider integrations before they instrument.
7. Set `SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN = 'auto.ai.{provider}'` (alphanumerics, `_`, `.` only).

## Checklist

- [ ] Instrumentation in `src/ai/`, integration in `src/integrations/`, registered in `getTracingIntegrations()` (LangChain first)
- [ ] Exported from `packages/server-utils/src/index.ts`, re-exported from the supported runtime packages
- [ ] E2E tests in `dev-packages/node-integration-tests/suites/tracing/{provider}/` (and `cloudflare-integration-tests/` if supported)
- [ ] Ops and attributes from `@sentry/conventions`, op derived via `getGenAiSpanOp()`
- [ ] Recording gated on `resolveAIRecordingOptions()`; no truncation, no token rollup
- [ ] JSDoc names the channels subscribed to, the supported SDK versions, and — for Pattern 2 — that it requires the Sentry runtime hook or bundler plugin
- [ ] Patching happens only once the target package is imported (zero cost if unused)

**When in doubt, follow the pattern of the most similar existing integration.**
