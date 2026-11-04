import { SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { _INTERNAL_shouldSkipAiProviderWrapping, getActiveSpan, spanToJSON } from '@sentry/core';
import { PI_AI_ORIGIN } from './constants';

/**
 * Whether the active span is a pi-ai `chat` span, which means a provider SDK call being made is pi-ai
 * sending its request. Bedrock requests are the exception: `awsIntegration` still reports them.
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
