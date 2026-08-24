import { dataloaderIntegration } from '@sentry/server-utils';

/**
 * Create spans for `dataloader` load/batch operations under Deno. Not a default;
 * add it to `integrations` to enable.
 *
 * @deprecated Use `dataloaderIntegration` instead. This alias will be
 * removed in a future major.
 */
export const denoDataloaderIntegration = dataloaderIntegration;
