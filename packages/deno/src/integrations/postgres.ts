import { postgresIntegration } from '@sentry/server-utils/orchestrion';

/**
 * Create spans for `pg` (node-postgres) queries under Deno. Included in the
 * default integrations.
 *
 * @deprecated Use `postgresIntegration` instead. This alias will be
 * removed in a future major.
 */
export const denoPostgresIntegration = postgresIntegration;
