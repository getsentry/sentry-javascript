import { redisIntegration } from '@sentry/server-utils/orchestrion';

/**
 * @deprecated Use `redisIntegration` instead.
 */
export const denoRedisIntegration: typeof redisIntegration = redisIntegration;
