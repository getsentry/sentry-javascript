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
|   +- NO -> Pattern 2: OTel Instrumentation (wrap client)
+- NO -> Does the SDK provide hooks/callbacks?
    |- YES (like LangChain) -> Pattern 3: Callback/Hook Based
    +- NO -> Pattern 4: Client Wrapping
```

## Runtime-Specific Placement

If an AI SDK only works in one runtime, code lives exclusively in that runtime's package. Do NOT add it to `packages/core/`.

- **Node.js-only** -> `packages/node/src/integrations/tracing/{provider}/`
- **Cloudflare-only** -> `packages/cloudflare/src/integrations/tracing/{provider}.ts`
- **Browser-only** -> `packages/browser/src/integrations/tracing/{provider}/`
- **Multi-runtime** -> shared core in `packages/core/src/tracing/{provider}/` with runtime-specific wrappers

## Span Hierarchy

- `gen_ai.invoke_agent` — parent/pipeline spans (chains, agents, orchestration)
- `gen_ai.chat`, `gen_ai.generate_text`, etc. — child spans (actual LLM calls)

## Shared Utilities (`packages/core/src/tracing/ai/`)

- `gen-ai-attributes.ts` — OTel Semantic Convention attribute constants. **Always use these, never hardcode.**
- `utils.ts` — `setTokenUsageAttributes()`, `getTruncatedJsonString()`, `truncateGenAiMessages()`, `buildMethodPath()`
- Only use attributes from [Sentry Gen AI Conventions](https://getsentry.github.io/sentry-conventions/attributes/gen_ai/).

## Streaming

- **Non-streaming:** `startSpan()`, set attributes from response
- **Streaming:** `startSpanManual()`, accumulate state via async generator or event listeners, set `GEN_AI_RESPONSE_STREAMING_ATTRIBUTE: true`, call `span.end()` in finally block
- Detect via `params.stream === true`
- References: `openai/streaming.ts` (async generator), `anthropic-ai/streaming.ts` (event listeners)

## Token Accumulation

- **Child spans:** Set tokens directly from API response via `setTokenUsageAttributes()`
- **Parent spans (`invoke_agent`):** Accumulate from children using event processor (see `vercel-ai/`)

## Pattern 1: OTel Span Processors

**Use when:** SDK emits OTel spans automatically (Vercel AI)

1. **Core:** Create `add{Provider}Processors()` in `packages/core/src/tracing/{provider}/index.ts` — registers `spanStart` listener + event processor
2. **Node.js:** Add `callWhenPatched()` optimization in `packages/node/src/integrations/tracing/{provider}/index.ts` — defers registration until package is imported
3. **Edge:** Direct registration in `packages/cloudflare/src/integrations/tracing/{provider}.ts` — no OTel, call processors immediately

Reference: `packages/node/src/integrations/tracing/vercelai/`

## Pattern 2: OTel Instrumentation (Client Wrapping)

**Use when:** SDK has no native OTel support (OpenAI, Anthropic, Google GenAI)

1. **Core:** Create `instrument{Provider}Client()` in `packages/core/src/tracing/{provider}/index.ts` — Proxy to wrap client methods, create spans manually
2. **Node.js `instrumentation.ts`:** Patch module exports, wrap client constructor. Check `_INTERNAL_shouldSkipAiProviderWrapping()` for LangChain compatibility.
3. **Node.js `index.ts`:** Export integration function using `generateInstrumentOnce()` helper

Reference: `packages/node/src/integrations/tracing/openai/`

## Pattern 3: Callback/Hook Based

**Use when:** SDK provides lifecycle hooks (LangChain, LangGraph)

1. **Core:** Create `create{Provider}CallbackHandler()` — implement SDK's callback interface, create spans in callbacks
2. **Node.js `instrumentation.ts`:** Auto-inject callbacks by patching runnable methods. Disable underlying AI provider wrapping.

Reference: `packages/node/src/integrations/tracing/langchain/`

## Auto-Instrumentation (Node.js)

**Mandatory** for Node.js AI integrations. OTel only patches when the package is imported (zero cost if unused).

### Steps

1. **Add to `getAutoPerformanceIntegrations()`** in `packages/node/src/integrations/tracing/index.ts` — LangChain MUST come first
2. **Add to `getOpenTelemetryInstrumentationToPreload()`** for OTel-based integrations
3. **Export from `packages/node/src/index.ts`**: integration function + options type
4. **Add E2E tests:**
   - Node.js: `dev-packages/node-integration-tests/suites/tracing/{provider}/`
   - Cloudflare: `dev-packages/cloudflare-integration-tests/suites/tracing/{provider}/`
   - Browser: `dev-packages/browser-integration-tests/suites/tracing/ai-providers/{provider}/`

## Key Rules

1. Respect `sendDefaultPii` for `recordInputs`/`recordOutputs`
2. Set `SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN = 'auto.ai.{provider}'` (alphanumerics, `_`, `.` only)
3. Truncate large data with helper functions from `utils.ts`
4. `gen_ai.invoke_agent` for parent ops, `gen_ai.chat` for child ops

## Checklist

- [ ] Runtime-specific code placed only in that runtime's package
- [ ] Added to `getAutoPerformanceIntegrations()` in correct order (Node.js)
- [ ] Added to `getOpenTelemetryInstrumentationToPreload()` (Node.js with OTel)
- [ ] Exported from appropriate package index
- [ ] E2E tests added and verifying auto-instrumentation
- [ ] Only used attributes from [Sentry Gen AI Conventions](https://getsentry.github.io/sentry-conventions/attributes/gen_ai/)
- [ ] JSDoc says "enabled by default" or "not enabled by default"
- [ ] Documented how to disable (if auto-enabled)
- [ ] Verified OTel only patches when package imported (Node.js)

## Reference Implementations

- **Pattern 1 (Span Processors):** `packages/node/src/integrations/tracing/vercelai/`
- **Pattern 2 (Client Wrapping):** `packages/node/src/integrations/tracing/openai/`
- **Pattern 3 (Callback/Hooks):** `packages/node/src/integrations/tracing/langchain/`

**When in doubt, follow the pattern of the most similar existing integration.**
