import { mysqlIntegration } from '@sentry/server-utils';

/**
 * Create spans for `mysql` queries under Deno. Included in the default
 * integrations.
 *
 * @deprecated Use `mysqlIntegration` instead. This alias will be removed
 * in a future major.
 */
export const denoMysqlIntegration = mysqlIntegration;
