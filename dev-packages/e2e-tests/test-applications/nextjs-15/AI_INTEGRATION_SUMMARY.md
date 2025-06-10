# Vercel AI Integration - Next.js 15 E2E Test Implementation

## Overview
This document summarizes the implementation of the Vercel AI integration for the Next.js 15 E2E test application.

## Changes Made

### 1. Updated Dependencies (package.json)
Added the following dependencies:
- `ai`: ^3.0.0 - Vercel AI SDK
- `zod`: ^3.22.4 - For tool parameter schemas

### 2. Server Configuration (sentry.server.config.ts)
Added the Vercel AI integration to the Sentry initialization:
```typescript
integrations: [
  Sentry.vercelAIIntegration(),
],
```

### 3. Test Page (app/ai-test/page.tsx)
Created a new test page that demonstrates various AI SDK features:
- Basic text generation with automatic telemetry
- Explicit telemetry configuration
- Tool calls and execution
- Disabled telemetry

The page wraps AI operations in a Sentry span for proper tracing.

### 4. Test Suite (tests/ai-test.test.ts)
Created a Playwright test that verifies:
- AI spans are created with correct operations (`ai.pipeline.generate_text`, `gen_ai.generate_text`, `gen_ai.execute_tool`)
- Span attributes match expected values (model info, tokens, prompts, etc.)
- Input/output recording respects `sendDefaultPii: true` setting
- Tool calls are properly traced
- Disabled telemetry prevents span creation

## Expected Behavior

When `sendDefaultPii: true` (as configured in this test app):
1. AI operations automatically enable telemetry
2. Input prompts and output responses are recorded in spans
3. Tool calls include arguments and results
4. Token usage is tracked

## Running the Tests

Prerequisites:
1. Build packages: `yarn build:tarball` (from repository root)
2. Start the test registry (Verdaccio)
3. Run the test: `yarn test:e2e nextjs-15` or `yarn test:run nextjs-15`

## Instrumentation Notes

The Vercel AI integration uses OpenTelemetry instrumentation to automatically patch the `ai` module methods. The instrumentation:
- Enables telemetry by default for all AI operations
- Respects the `sendDefaultPii` client option for recording inputs/outputs
- Allows per-call telemetry configuration via `experimental_telemetry`
- Follows a precedence hierarchy: integration options > method options > defaults
