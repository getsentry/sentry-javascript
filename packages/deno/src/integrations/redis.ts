import { redisIntegration } from '@sentry/server-utils';

/**
 * @deprecated Use `redisIntegration` instead.
 */
export const denoRedisIntegration: typeof redisIntegration = redisIntegration;
