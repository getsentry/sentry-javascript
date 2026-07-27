/**
 * The provider value for the `gen_ai.provider.name` attribute.
 * @see https://developers.cloudflare.com/workers-ai/
 */
export const WORKERS_AI_PROVIDER_NAME = 'cloudflare.workers_ai';

/**
 * The Sentry origin for spans created by the Workers AI instrumentation.
 */
export const WORKERS_AI_ORIGIN = 'auto.ai.cloudflare.workers_ai';

/**
 * The key used to register this provider in the AI provider skip registry.
 *
 * @see `_INTERNAL_skipAiProviderWrapping`
 */
export const WORKERS_AI_INTEGRATION_NAME = 'Workers_AI' as const;
