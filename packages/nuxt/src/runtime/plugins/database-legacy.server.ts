import type { NitroAppPlugin } from 'nitropack';
import { useDatabase } from 'nitropack/runtime';
// @ts-expect-error - This is a virtual module
import { databaseConfig } from '#sentry/database-config.mjs';
import type { DatabaseConnectionConfig } from '../utils/database-span-data';
import { createDatabasePlugin } from '../utils/instrumentDatabase';

/**
 * Nitro plugin that instruments database calls for Nuxt v3/v4 (Nitro v2)
 */
export default (() => {
  createDatabasePlugin(useDatabase, databaseConfig as Record<string, DatabaseConnectionConfig>);
}) satisfies NitroAppPlugin;
