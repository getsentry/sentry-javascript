import { knexIntegration } from '@sentry/server-utils/orchestrion';

/**
 * Create spans for `knex` queries under Deno. Not a default; add it to
 * `integrations` to enable.
 *
 * @deprecated Use `knexIntegration` instead. This alias will be removed
 * in a future major.
 */
export const denoKnexIntegration = knexIntegration;
