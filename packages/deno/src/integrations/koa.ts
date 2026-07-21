import { koaChannelIntegration } from '@sentry/server-utils/orchestrion';

/**
 * Create spans for `koa` middleware/router layers under Deno. Included in the
 * default integrations.
 *
 * @deprecated Use `koaChannelIntegration` instead. This alias will be removed
 * in a future major.
 */
export const denoKoaIntegration = koaChannelIntegration;
