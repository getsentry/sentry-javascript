import { SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { _INTERNAL_shouldSkipAiProviderWrapping, getActiveSpan, spanToJSON } from '@sentry/core';
import { PI_AI_ORIGIN } from './constants';

/**
 * Whether the active span is a pi-ai `chat` span, which means the provider SDK call being made is
 * pi-ai sending its request. pi-ai sends through the `openai`, `@anthropic-ai/sdk`, `@google/genai`
 * and (before 0.84.2) `@mistralai/mistralai` clients, and on Cloudflare through the Workers AI binding
 * (`createAI()` of `agents/models/pi-ai`). Those integrations check this per request so that they
 * don't report it a second time, while the app's own calls to those SDKs keep their spans.
 *
 * Bedrock requests go through `@aws-sdk/client-bedrock-runtime`, which `awsIntegration` still reports.
 */
export function isInsidePiAiSpan(): boolean {
  const span = getActiveSpan();
  return !!span && spanToJSON(span).attributes[SENTRY_ORIGIN] === PI_AI_ORIGIN;
}

/**
 * Whether a provider integration should leave a call alone, because the integration driving the SDK
 * reports it. LangChain and Vercel AI mark the providers they drive as skipped; pi-ai is detected per
 * request, by its active span.
 */
export function shouldSkipAiProviderSpan(integrationName: string): boolean {
  return _INTERNAL_shouldSkipAiProviderWrapping(integrationName) || isInsidePiAiSpan();
}
