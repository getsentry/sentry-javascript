import type { ConnectorName } from 'db0';
import type { DatabaseConnectionConfig as DatabaseConfig } from 'nitropack/types';

export interface DatabaseSpanData {
  [key: string]: string | number | undefined;
}

/**
 * Extracts span attributes from the database configuration.
 */
export function getDatabaseSpanData(config?: DatabaseConfig): Partial<DatabaseSpanData> {
  try {
    if (!config?.connector) {
      // Default to SQLite if no connector is configured
      return {
        'db.namespace': 'db.sqlite',
      };
    }

    if (config.connector === 'postgresql' || config.connector === 'mysql2') {
      return {
        'server.address': config.options?.host,
        'server.port': config.options?.port,
      };
    }

    if (config.connector === 'pglite') {
      return {
        'db.namespace': config.options?.dataDir,
      };
    }

    if ((['better-sqlite3', 'bun', 'sqlite', 'sqlite3'] as ConnectorName[]).includes(config.connector)) {
      return {
        // DB is the default file name in nitro for sqlite-like connectors
        'db.namespace': `${config.options?.name ?? 'db'}.sqlite`,
      };
    }

    return {};
  } catch {
    // This is a best effort to get some attributes, so it is not an absolute must
    // Since the user can configure invalid options, we should not fail the whole instrumentation.
    return {};
  }
}
