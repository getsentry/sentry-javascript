import { postgresChannelIntegration } from '@sentry/server-utils/orchestrion';

/**
 * Create spans for `pg` (node-postgres) queries under Deno. Included in the
 * default integrations.
 *
 * @deprecated Use `postgresChannelIntegration` instead. This alias will be
 * removed in a future major.
 */
export const denoPostgresIntegration = postgresChannelIntegration;
