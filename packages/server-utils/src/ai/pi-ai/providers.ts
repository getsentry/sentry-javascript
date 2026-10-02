import { _INTERNAL_shouldSkipAiProviderWrapping, _INTERNAL_skipAiProviderWrapping } from '@sentry/core';
import { ANTHROPIC_AI_INTEGRATION_NAME } from '../anthropic-ai/constants';
import { GOOGLE_GENAI_INTEGRATION_NAME } from '../google-genai/constants';
import { OPENAI_INTEGRATION_NAME } from '../openai/constants';

// pi-ai sends its requests through the `openai`, `@anthropic-ai/sdk` and `@google/genai` clients.
// Left alone, those integrations report the same request a second time beside the `chat` span of
// the framework that sent it. Bedrock requests go through `@aws-sdk/client-bedrock-runtime`, which
// `awsIntegration` still reports; that one has no skip yet.
const PI_AI_PROVIDER_INTEGRATIONS = [
  OPENAI_INTEGRATION_NAME,
  ANTHROPIC_AI_INTEGRATION_NAME,
  GOOGLE_GENAI_INTEGRATION_NAME,
];

/**
 * Stop the provider SDK integrations from reporting the requests pi-ai sends. The skip is
 * process-wide: the provider SDKs do not know which of their calls pi-ai made.
 *
 * The registry is reset per client, so callers apply this on the first request instead of once at
 * setup, or the next `init()` would undo it.
 */
export function skipPiAiProviderIntegrations(): void {
  if (!PI_AI_PROVIDER_INTEGRATIONS.every(provider => _INTERNAL_shouldSkipAiProviderWrapping(provider))) {
    _INTERNAL_skipAiProviderWrapping(PI_AI_PROVIDER_INTEGRATIONS);
  }
}
