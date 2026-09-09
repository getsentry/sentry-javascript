---
name: add-ai-integration
description: Add a new AI provider integration to the Sentry JavaScript SDK. Use when contributing a new AI instrumentation (OpenAI, Anthropic, Vercel AI, LangChain, etc.) or modifying an existing one.
argument-hint: <provider-name>
---

# Adding a New AI Integration

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
- **Runtime packages** (`node`, `cloudflare`, `bun`, ...) re-export the integration from `@sentry/server-utils` -- they do not define their own

Cloudflare-only client wrapping (Workers AI) is the exception: it is applied in `packages/cloudflare/src/instrumentations/worker/instrumentEnv.ts`, wrapping the binding from `env`.

## Span Hierarchy

- `gen_ai.invoke_agent` — parent/pipeline spans (chains, agents, orchestration)
- `gen_ai.chat`, `gen_ai.generate_text`, etc. — child spans (actual LLM calls)

## Shared Utilities (`packages/server-utils/src/ai/core/`)

- `gen-ai-attributes.ts` — OTel Semantic Convention attribute constants. **Always use these, never hardcode.**
- `utils.ts` — `setTokenUsageAttributes()`, `buildMethodPath()`, `resolveAIRecordingOptions()`, `getGenAiSpanOp()`, `endStreamSpan()`, `extractSystemInstructions()`
- Only use attributes from [Sentry Gen AI Conventions](https://getsentry.github.io/sentry-conventions/attributes/gen_ai/).

## Streaming

- **Non-streaming:** `startSpan()`, set attributes from response
- **Streaming:** `startSpanManual()`, accumulate state via async generator or event listeners, set `GEN_AI_RESPONSE_STREAMING_ATTRIBUTE: true`, call `span.end()` in finally block
- Detect via `params.stream === true`
- References: `ai/openai/streaming.ts` (async generator), `ai/anthropic-ai/streaming.ts` (event listeners)

## Token Accumulation

- **Child spans:** Set tokens directly from API response via `setTokenUsageAttributes()`
- **Parent spans (`invoke_agent`):** Accumulate inside the channel subscriber as usage/finish chunks arrive, then set on the open parent span before ending it (see `integrations/vercel-ai/vercel-ai-dc-subscriber.ts`). There is no event processor doing this rollup.

## Pattern 1: Native Tracing Channel

**Use when:** the SDK publishes to `diagnostics_channel` itself (`ai` >= 7 publishes `ai:telemetry`)

1. Write the subscriber in `packages/server-utils/src/integrations/{provider}/{provider}-dc-subscriber.ts` — read the channel payloads, open spans, set gen_ai attributes
2. Subscribe from the integration's `setupOnce()`, wrapped in `waitForTracingChannelBinding()` so it waits for the async-context binding:

```ts
setupOnce() {
  if (!dc.tracingChannel) return;
  waitForTracingChannelBinding(() => {
    subscribe{Provider}TracingChannel(dc.tracingChannel, options);
  });
}
```

Subscribing is a no-op on SDK versions that never publish, so it is always safe to call.

Reference: `packages/server-utils/src/integrations/vercel-ai/vercel-ai-dc-subscriber.ts`

## Pattern 2: Orchestrion-Injected Channels

**Use when:** the SDK has no telemetry of its own (OpenAI, Anthropic, Google GenAI, `ai` < 7)

Orchestrion injects `diagnostics_channel` tracing channels into the target module's functions at load time; we then subscribe to those injected channels. This replaced the old OTel instrumentation packages — there is no `@opentelemetry/instrumentation-*` dependency in this path.

1. Create the span-building/attribute logic in `packages/server-utils/src/ai/{provider}/`
2. Declare the module, version range, and methods to inject in `packages/server-utils/src/orchestrion/config/{provider}.ts`
3. In `packages/server-utils/src/integrations/{provider}.ts`, call `invokeOrchestrionInstrumentation(client, {provider}ModuleNames, fn, [options])` from `setup(client)`, and bind each injected channel to a span with `bindTracingChannelToSpan()`. Check `_INTERNAL_shouldSkipAiProviderWrapping()` for LangChain compatibility.

Reference: `packages/server-utils/src/integrations/openai.ts` + `packages/server-utils/src/orchestrion/config/openai.ts`

**A provider can need both patterns.** `vercelAIIntegration` subscribes to the native `ai:telemetry` channel for `ai` >= 7 _and_ runs orchestrion injection for `ai` v4-v6, in the same integration.

## Pattern 3: Callback/Exporter

**Use when:** SDK provides lifecycle hooks or an exporter interface (LangChain, LangGraph, Mastra)

1. Create `create{Provider}CallbackHandler()` in `packages/server-utils/src/ai/{provider}/index.ts` — implement the SDK's callback/exporter interface, create spans in the callbacks
2. In `packages/server-utils/src/integrations/{provider}.ts`, auto-inject the handler by patching the relevant methods, and call `_INTERNAL_skipAiProviderWrapping()` to disable the underlying AI provider wrapping

Reference: `packages/server-utils/src/ai/langchain/`, and `packages/server-utils/src/ai/mastra/` for an exporter-shaped agent framework

## Registration

**Mandatory.** Patching only happens once the target package is imported (zero cost if unused).

### Steps

1. **Add to `getTracingIntegrations()`** in `packages/server-utils/src/integrations/index.ts` — LangChain MUST come first, so it can disable the AI provider integrations before they instrument
2. **Export from `packages/server-utils/src/index.ts`**: integration function + options type
3. **Re-export from the runtime packages** that support it (e.g. `packages/node/src/index.ts`, `packages/cloudflare/src/index.ts`)
4. **Add E2E tests:**
   - Node.js: `dev-packages/node-integration-tests/suites/tracing/{provider}/`
   - Cloudflare: `dev-packages/cloudflare-integration-tests/suites/tracing/{provider}/`

## Key Rules

1. Respect `dataCollection.genAI` for recording input and output messages
2. Set `SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN = 'auto.ai.{provider}'` (alphanumerics, `_`, `.` only)
3. Gate input/output message recording behind `resolveAIRecordingOptions()`
4. `gen_ai.invoke_agent` for parent ops, `gen_ai.chat` for child ops

## Checklist

- [ ] Instrumentation in `packages/server-utils/src/ai/`, integration in `packages/server-utils/src/integrations/`
- [ ] Added to `getTracingIntegrations()` in correct order (LangChain first)
- [ ] Exported from `packages/server-utils/src/index.ts` and re-exported from the supported runtime packages
- [ ] E2E tests added and verifying auto-instrumentation
- [ ] Only used attributes from [Sentry Gen AI Conventions](https://getsentry.github.io/sentry-conventions/attributes/gen_ai/)
- [ ] JSDoc says "enabled by default" or "not enabled by default"
- [ ] Documented how to disable (if auto-enabled)
- [ ] Verified patching only happens when the target package is imported

## Reference Implementations

- **Pattern 1 (Native channel):** `packages/server-utils/src/integrations/vercel-ai/vercel-ai-dc-subscriber.ts`
- **Pattern 2 (Orchestrion channels):** `packages/server-utils/src/integrations/openai.ts` + `packages/server-utils/src/orchestrion/config/openai.ts`
- **Pattern 3 (Callback/Exporter):** `packages/server-utils/src/ai/langchain/`, `packages/server-utils/src/ai/mastra/`
- **Both patterns at once:** `packages/server-utils/src/integrations/vercel-ai/index.ts`

**When in doubt, follow the pattern of the most similar existing integration.**
