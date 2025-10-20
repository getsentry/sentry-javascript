import type { ConnectorName } from 'db0';
import type { DatabaseConnectionConfig as DatabaseConfig } from 'nitropack/types';
import { describe, expect, it } from 'vitest';
import { getDatabaseSpanData } from '../../../src/runtime/utils/database-span-data';

describe('getDatabaseSpanData', () => {
  describe('no config', () => {
    it('should return default SQLite namespace when no config provided', () => {
      const result = getDatabaseSpanData();
      expect(result).toEqual({
        'db.namespace': 'db.sqlite',
      });
    });

    it('should return default SQLite namespace when config has no connector', () => {
      const result = getDatabaseSpanData({} as DatabaseConfig);
      expect(result).toEqual({
        'db.namespace': 'db.sqlite',
      });
    });
  });

  describe('PostgreSQL connector', () => {
    it('should extract host and port for postgresql', () => {
      const config: DatabaseConfig = {
        connector: 'postgresql' as ConnectorName,
        options: {
          host: 'localhost',
          port: 5432,
        },
      };

      const result = getDatabaseSpanData(config);
      expect(result).toEqual({
        'server.address': 'localhost',
        'server.port': 5432,
      });
    });

    it('should handle missing options for postgresql', () => {
      const config: DatabaseConfig = {
        connector: 'postgresql' as ConnectorName,
      };

      const result = getDatabaseSpanData(config);
      expect(result).toEqual({
        'server.address': undefined,
        'server.port': undefined,
      });
    });

    it('should handle partial options for postgresql', () => {
      const config: DatabaseConfig = {
        connector: 'postgresql' as ConnectorName,
        options: {
          host: 'pg-host',
        },
      };

      const result = getDatabaseSpanData(config);
      expect(result).toEqual({
        'server.address': 'pg-host',
        'server.port': undefined,
      });
    });
  });

  describe('MySQL connector', () => {
    it('should extract host and port for mysql2', () => {
      const config: DatabaseConfig = {
        connector: 'mysql2' as ConnectorName,
        options: {
          host: 'mysql-host',
          port: 3306,
        },
      };

      const result = getDatabaseSpanData(config);
      expect(result).toEqual({
        'server.address': 'mysql-host',
        'server.port': 3306,
      });
    });

    it('should handle missing options for mysql2', () => {
      const config: DatabaseConfig = {
        connector: 'mysql2' as ConnectorName,
      };

      const result = getDatabaseSpanData(config);
      expect(result).toEqual({
        'server.address': undefined,
        'server.port': undefined,
      });
    });
  });

  describe('PGLite connector', () => {
    it('should extract dataDir for pglite', () => {
      const config: DatabaseConfig = {
        connector: 'pglite' as ConnectorName,
        options: {
          dataDir: '/path/to/data',
        },
      };

      const result = getDatabaseSpanData(config);
      expect(result).toEqual({
        'db.namespace': '/path/to/data',
      });
    });

    it('should handle missing dataDir for pglite', () => {
      const config: DatabaseConfig = {
        connector: 'pglite' as ConnectorName,
        options: {},
      };

      const result = getDatabaseSpanData(config);
      expect(result).toEqual({
        'db.namespace': undefined,
      });
    });
  });

  describe('SQLite-like connectors', () => {
    it.each(['better-sqlite3', 'bun', 'sqlite', 'sqlite3'] as ConnectorName[])(
      'should extract database name for %s',
      connector => {
        const config: DatabaseConfig = {
          connector,
          options: {
            name: 'custom-db',
          },
        };

        const result = getDatabaseSpanData(config);
        expect(result).toEqual({
          'db.namespace': 'custom-db.sqlite',
        });
      },
    );

    it.each(['better-sqlite3', 'bun', 'sqlite', 'sqlite3'] as ConnectorName[])(
      'should use default name for %s when name is not provided',
      connector => {
        const config: DatabaseConfig = {
          connector,
          options: {},
        };

        const result = getDatabaseSpanData(config);
        expect(result).toEqual({
          'db.namespace': 'db.sqlite',
        });
      },
    );

    it.each(['better-sqlite3', 'bun', 'sqlite', 'sqlite3'] as ConnectorName[])(
      'should handle missing options for %s',
      connector => {
        const config: DatabaseConfig = {
          connector,
        };

        const result = getDatabaseSpanData(config);
        expect(result).toEqual({
          'db.namespace': 'db.sqlite',
        });
      },
    );
  });

  describe('unsupported connector', () => {
    it('should return empty object for unsupported connector', () => {
      const config: DatabaseConfig = {
        connector: 'unknown-connector' as ConnectorName,
      };

      const result = getDatabaseSpanData(config);
      expect(result).toEqual({});
    });
  });

  describe('error handling', () => {
    it('should return empty object when accessing invalid config throws', () => {
      // Simulate a config that might throw during access
      const invalidConfig = {
        connector: 'postgresql' as ConnectorName,
        get options(): never {
          throw new Error('Invalid access');
        },
      };

      const result = getDatabaseSpanData(invalidConfig as unknown as DatabaseConfig);
      expect(result).toEqual({});
    });
  });
});
