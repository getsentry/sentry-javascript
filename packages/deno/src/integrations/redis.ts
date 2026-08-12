import { redisIntegration } from '@sentry/server-utils/orchestrion';

/**
 * Create spans for `redis` operations under Deno. Included in the default
 * integrations.
 *
 * @deprecated Use `redisIntegration` instead. This alias will be
 * removed in a future major.
 */
export const denoRedisIntegration = redisIntegration;
