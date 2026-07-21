import { amqplibChannelIntegration } from '@sentry/server-utils/orchestrion';

/**
 * Create spans for `amqplib` publish/consume operations under Deno. Included in
 * the default integrations.
 *
 * @deprecated Use `amqplibChannelIntegration` instead. This alias will be
 * removed in a future major.
 */
export const denoAmqplibIntegration = amqplibChannelIntegration;
