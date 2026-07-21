import { mysqlChannelIntegration } from '@sentry/server-utils/orchestrion';

/**
 * Create spans for `mysql` queries under Deno. Included in the default
 * integrations.
 *
 * @deprecated Use `mysqlChannelIntegration` instead. This alias will be removed
 * in a future major.
 */
export const denoMysqlIntegration = mysqlChannelIntegration;
