import type { ConnectorName } from 'db0';

export interface DatabaseSpanData {
  [key: string]: string | number | undefined;
}

/**
 * A minimal database connection configuration type compatible with both nitropack (Nitro v2) and nitro (Nitro v3+).
 * Mirrors the shape of `DatabaseConnectionConfig` from both packages.
 */
export interface DatabaseConnectionConfig {
  connector?: ConnectorName;
  options?: {
    host?: string;
    port?: number;
    dataDir?: string;
    name?: string;
    [key: string]: unknown;
  };
}

/**
 * Extracts span attributes from the database configuration.
 */
export function getDatabaseSpanData(config?: DatabaseConnectionConfig): Partial<DatabaseSpanData> {
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
