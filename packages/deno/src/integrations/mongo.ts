import { mongodbChannelIntegration } from '@sentry/server-utils/orchestrion';

/**
 * Create spans for `mongodb` queries under Deno. Included in the default
 * integrations.
 *
 * @deprecated Use `mongodbChannelIntegration` instead. This alias will be
 * removed in a future major.
 */
export const denoMongoIntegration = mongodbChannelIntegration;
