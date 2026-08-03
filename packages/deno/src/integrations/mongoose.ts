import { mongooseIntegration } from '@sentry/server-utils/orchestrion';

/**
 * Create spans for `mongoose` queries under Deno. Included in the default
 * integrations.
 *
 * @deprecated Use `mongooseIntegration` instead. This alias will be
 * removed in a future major.
 */
export const denoMongooseIntegration = mongooseIntegration;
