import type { NitroAppPlugin } from 'nitro/types';
import { useDatabase } from 'nitro/database';
// @ts-expect-error - This is a virtual module
import { databaseConfig } from '#sentry/database-config.mjs';
import type { DatabaseConnectionConfig } from '../utils/database-span-data';
import { createDatabasePlugin } from '../utils/instrumentDatabase';

/**
 * Nitro plugin that instruments database calls for Nuxt v5+ (Nitro v3+)
 */
export default (() => {
  createDatabasePlugin(useDatabase, databaseConfig as Record<string, DatabaseConnectionConfig>);
}) satisfies NitroAppPlugin;
