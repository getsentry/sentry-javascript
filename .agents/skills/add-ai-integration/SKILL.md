---
name: add-ai-integration
description: Add a new AI provider integration to the Sentry JavaScript SDK. Use when contributing a new AI instrumentation (OpenAI, Anthropic, Vercel AI, LangChain, etc.) or modifying an existing one.
argument-hint: <provider-name>
---

# Adding a New AI Integration

## Decision Tree

```
Does the AI SDK have native OpenTelemetry support?
|- YES -> Does it emit OTel spans automatically?
|   |- YES (like Vercel AI) -> Pattern 1: OTel Span Processors
|   +- NO -> Pattern 2: Orchestrion Instrumentation (wrap client)
+- NO -> Does the SDK provide hooks/callbacks?
    |- YES (like LangChain) -> Pattern 3: Callback/Hook Based
    +- NO -> Pattern 4: Client Wrapping
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
- **Parent spans (`invoke_agent`):** Accumulate from children using event processor (see `ai/vercel-ai/`)

## Pattern 1: OTel Span Processors

**Use when:** SDK emits OTel spans automatically (Vercel AI)

1. Create `add{Provider}Processors()` in `packages/server-utils/src/ai/{provider}/index.ts` — registers `spanStart` listener + event processor
2. Wire it up in `packages/server-utils/src/integrations/{provider}.ts` and register in `getTracingIntegrations()`

Reference: `packages/server-utils/src/ai/vercel-ai/` + `packages/server-utils/src/integrations/vercel-ai/`

## Pattern 2: Orchestrion Instrumentation (Client Wrapping)

**Use when:** SDK has no native telemetry of its own (OpenAI, Anthropic, Google GenAI)

1. Create the span-building logic in `packages/server-utils/src/ai/{provider}/index.ts`
2. Declare the module/method targets in `packages/server-utils/src/orchestrion/config/{provider}.ts`
3. In `packages/server-utils/src/integrations/{provider}.ts`, call `invokeOrchestrionInstrumentation()` and bind the resulting `diagnostics_channel` tracing channels to spans via `bindTracingChannelToSpan()`. Check `_INTERNAL_shouldSkipAiProviderWrapping()` for LangChain compatibility.

Patching goes through orchestrion + Node `diagnostics_channel`, not OTel instrumentation packages.

Reference: `packages/server-utils/src/integrations/openai.ts` + `packages/server-utils/src/ai/openai/`

## Pattern 3: Callback/Hook Based

**Use when:** SDK provides lifecycle hooks (LangChain, LangGraph)

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

- **Pattern 1 (Span Processors):** `packages/server-utils/src/ai/vercel-ai/`
- **Pattern 2 (Client Wrapping):** `packages/server-utils/src/ai/openai/` + `packages/server-utils/src/integrations/openai.ts`
- **Pattern 3 (Callback/Hooks):** `packages/server-utils/src/ai/langchain/`, `packages/server-utils/src/ai/mastra/`

**When in doubt, follow the pattern of the most similar existing integration.**
