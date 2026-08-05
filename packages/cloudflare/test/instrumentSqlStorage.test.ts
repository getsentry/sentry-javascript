import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import * as sentryCore from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { instrumentSqlStorage } from '../src/instrumentations/instrumentSqlStorage';

describe('instrumentSqlStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds code.function.name from the enclosing active span', () => {
    const startSpanSpy = vi.spyOn(sentryCore, 'startSpan');
    vi.spyOn(sentryCore, 'getActiveSpan').mockReturnValue({} as any);
    vi.spyOn(sentryCore, 'spanToJSON').mockReturnValue({ data: { 'code.function.name': 'greet' } } as any);
    const mockSql = createMockSqlStorage();
    const instrumented = instrumentSqlStorage(mockSql);

    instrumented.exec('SELECT * FROM users WHERE id = ?', 42);

    expect(startSpanSpy).toHaveBeenCalledWith(
      {
        op: 'db.query',
        name: 'SELECT users',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.durable_object.sql',
          'db.system.name': 'cloudflare-durable-object-sql',
          'db.operation.name': 'exec',
          'db.query.text': 'SELECT * FROM users WHERE id = ?',
          'db.query.summary': 'SELECT users',
          'cloudflare.durable_object.query.bindings': 1,
          'code.function.name': 'greet',
        },
      },
      expect.any(Function),
    );
  });

  it('instruments exec with summary as span name and sanitized query as db.query.text', () => {
    const startSpanSpy = vi.spyOn(sentryCore, 'startSpan');
    const mockSql = createMockSqlStorage();
    const instrumented = instrumentSqlStorage(mockSql);

    instrumented.exec('SELECT * FROM users WHERE id = ?', 42);

    expect(startSpanSpy).toHaveBeenCalledWith(
      {
        op: 'db.query',
        name: 'SELECT users',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.durable_object.sql',
          'db.system.name': 'cloudflare-durable-object-sql',
          'db.operation.name': 'exec',
          'db.query.text': 'SELECT * FROM users WHERE id = ?',
          'db.query.summary': 'SELECT users',
          'cloudflare.durable_object.query.bindings': 1,
        },
      },
      expect.any(Function),
    );
  });

  it('sanitizes embedded literals in db.query.text', () => {
    const startSpanSpy = vi.spyOn(sentryCore, 'startSpan');
    const mockSql = createMockSqlStorage();
    const instrumented = instrumentSqlStorage(mockSql);

    instrumented.exec("SELECT * FROM users WHERE name = 'Alice' AND age > 30");

    expect(startSpanSpy).toHaveBeenCalledWith(
      {
        op: 'db.query',
        name: 'SELECT users',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.durable_object.sql',
          'db.system.name': 'cloudflare-durable-object-sql',
          'db.operation.name': 'exec',
          'db.query.text': 'SELECT * FROM users WHERE name = ? AND age > ?',
          'db.query.summary': 'SELECT users',
          'cloudflare.durable_object.query.bindings': 0,
        },
      },
      expect.any(Function),
    );
  });

  it('passes bindings through to the original exec', () => {
    const mockSql = createMockSqlStorage();
    const instrumented = instrumentSqlStorage(mockSql);

    instrumented.exec('SELECT * FROM users WHERE id = ?', 42);

    expect(mockSql.exec).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?', 42);
  });

  it('tracks binding count in span attributes', () => {
    const startSpanSpy = vi.spyOn(sentryCore, 'startSpan');
    const mockSql = createMockSqlStorage();
    const instrumented = instrumentSqlStorage(mockSql);

    instrumented.exec('INSERT INTO users (name, email) VALUES (?, ?)', 'Alice', 'alice@example.com');

    expect(startSpanSpy).toHaveBeenCalledWith(
      {
        op: 'db.query',
        name: 'INSERT users',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.durable_object.sql',
          'db.system.name': 'cloudflare-durable-object-sql',
          'db.operation.name': 'exec',
          'db.query.text': 'INSERT INTO users (name, email) VALUES (?, ?)',
          'db.query.summary': 'INSERT users',
          'cloudflare.durable_object.query.bindings': 2,
        },
      },
      expect.any(Function),
    );
  });

  it('returns the cursor from exec', () => {
    const mockCursor = createMockCursor();
    const mockSql = createMockSqlStorage(mockCursor);
    const instrumented = instrumentSqlStorage(mockSql);

    const result = instrumented.exec('SELECT 1');

    expect(result).toBe(mockCursor);
  });

  it('does not instrument non-exec properties', () => {
    const startSpanSpy = vi.spyOn(sentryCore, 'startSpan');
    const mockSql = createMockSqlStorage();
    const instrumented = instrumentSqlStorage(mockSql);

    expect(instrumented.databaseSize).toBe(1024);
    expect(startSpanSpy).not.toHaveBeenCalled();
  });

  it('preserves native getter this binding through the proxy', () => {
    class BrandCheckedSql {
      #internal = 1024;
      get databaseSize() {
        return this.#internal;
      }
      exec = vi.fn().mockReturnValue(createMockCursor());
    }

    const sql = new BrandCheckedSql();
    const instrumented = instrumentSqlStorage(sql as any);

    expect(instrumented.databaseSize).toBe(1024);
  });

  it('propagates errors from exec', () => {
    const mockSql = createMockSqlStorage();
    mockSql.exec = vi.fn().mockImplementation(() => {
      throw new Error('SQL error');
    });
    const instrumented = instrumentSqlStorage(mockSql);

    expect(() => instrumented.exec('INVALID SQL')).toThrow('SQL error');
  });

  it('creates a span for each exec call', () => {
    const startSpanSpy = vi.spyOn(sentryCore, 'startSpan');
    const mockSql = createMockSqlStorage();
    const instrumented = instrumentSqlStorage(mockSql);

    instrumented.exec('SELECT 1');
    instrumented.exec('SELECT 2');

    expect(startSpanSpy).toHaveBeenCalledTimes(2);
    expect(mockSql.exec).toHaveBeenCalledTimes(2);
  });

  describe('internal storage queries', () => {
    it('does not create a span for Cloudflare-internal queries', () => {
      const startSpanSpy = vi.spyOn(sentryCore, 'startSpan');
      const mockCursor = createMockCursor();
      const mockSql = createMockSqlStorage(mockCursor);
      const instrumented = instrumentSqlStorage(mockSql);

      const result = instrumented.exec('SELECT * FROM cf_agents_state WHERE id = ?', 'foo');

      expect(startSpanSpy).not.toHaveBeenCalled();
      expect(mockSql.exec).toHaveBeenCalledWith('SELECT * FROM cf_agents_state WHERE id = ?', 'foo');
      expect(result).toBe(mockCursor);
    });

    describe('internal tables (cf_ prefix) are skipped', () => {
      it.each([
        ['SELECT', 'SELECT * FROM cf_agents_state WHERE id = ?'],
        ['INSERT', 'INSERT INTO cf_agents_fibers (id, callback) VALUES (?, ?)'],
        ['DELETE', 'DELETE FROM cf_agents_schedules WHERE id = ?'],
        ['UPDATE', 'UPDATE cf_agent_tool_runs SET output_json = ? WHERE id = ?'],
        ['CREATE TABLE', 'CREATE TABLE IF NOT EXISTS cf_agents_workflows (id TEXT PRIMARY KEY NOT NULL)'],
        ['ALTER TABLE', 'ALTER TABLE cf_agents_queues ADD COLUMN retry_options TEXT'],
        ['DROP TABLE', 'DROP TABLE cf_agents_state'],
        ['cf_agent_ prefix', 'SELECT * FROM cf_agent_identity'],
        ['cf_ai_ prefix', 'INSERT INTO cf_ai_chat_stream_chunks (id) VALUES (?)'],
        ['cf_mcp_ prefix', 'SELECT * FROM cf_mcp_agent_event'],
        ['schema version', 'SELECT version FROM cf_schema_version'],
        // SQLite upsert forms used by the agents framework for state/schedule/MCP persistence
        ['INSERT OR REPLACE', 'INSERT OR REPLACE INTO cf_agents_state (id, state) VALUES (?, ?)'],
        [
          'INSERT OR REPLACE with column list',
          `INSERT OR REPLACE INTO cf_agents_mcp_servers ( id, name, server_url, client_id, auth_url,
            callback_url, server_options )
          VALUES ( ?, ?, ?, ?, ?, ?, ? )`,
        ],
        ['INSERT OR IGNORE', 'INSERT OR IGNORE INTO cf_agents_sub_agents (class, name) VALUES (?, ?)'],
        ['REPLACE INTO', 'REPLACE INTO cf_agents_queues (id, payload) VALUES (?, ?)'],
        ['UPDATE OR REPLACE', 'UPDATE OR REPLACE cf_agents_state SET state = ? WHERE id = ?'],
        // The summary of a CREATE INDEX carries the index name, not the indexed table — the cf_
        // target only exists in the ON clause of the full statement.
        [
          'CREATE INDEX (framework statement)',
          `create index if not exists idx_ai_chat_agent_tool_request_id
            on cf_ai_chat_agent_tool_runs(request_id)`,
        ],
        ['CREATE INDEX (uppercase)', 'CREATE INDEX idx_agents_state_id ON cf_agents_state (id)'],
        ['CREATE UNIQUE INDEX', 'CREATE UNIQUE INDEX idx_agents_state_id ON cf_agents_state (id)'],
        [
          'CREATE INDEX (without IF NOT EXISTS)',
          'CREATE INDEX idx_chunks_stream ON cf_ai_chat_stream_chunks (stream_id)',
        ],
        [
          'JOIN between internal tables',
          `SELECT f.fiber_id, f.status
             FROM cf_agents_fibers f
             LEFT JOIN cf_agents_runs r ON r.id = f.fiber_id
             WHERE f.status IN ('pending', 'running')`,
        ],
        // `.some()` — any internal table present means the query is framework-driven noise.
        ['JOIN with a user table', 'SELECT * FROM cf_agents_state s JOIN users u ON u.id = s.id'],
        ['lowercase keywords and prefix', 'select * from CF_AGENTS_STATE'],
      ])('skips %s', (_label, query) => {
        expect(execCreatesSpan(query)).toBe(false);
      });
    });

    describe('user queries stay instrumented', () => {
      it.each([
        ['SELECT', 'SELECT * FROM users WHERE id = ?'],
        ['INSERT', 'INSERT INTO orders (id, total) VALUES (?, ?)'],
        ['UPDATE', 'UPDATE products SET price = ? WHERE id = ?'],
        ['DELETE', 'DELETE FROM sessions WHERE expired = 1'],
        ['CREATE TABLE', 'CREATE TABLE users (id TEXT PRIMARY KEY)'],
        ['CREATE INDEX', 'CREATE INDEX idx_name ON users (name)'],
        ['table with cf in the middle', 'SELECT * FROM my_cf_table'],
        ['table starting with cfg', 'SELECT * FROM cfg_settings'],
        ['INSERT OR REPLACE', 'INSERT OR REPLACE INTO users (id, name) VALUES (?, ?)'],
        ['REPLACE INTO', 'REPLACE INTO sessions (id, token) VALUES (?, ?)'],
        ['UPDATE OR IGNORE', 'UPDATE OR IGNORE products SET price = ? WHERE id = ?'],
        // No resolvable table target — safe default is to instrument.
        ['no-table SELECT', 'SELECT 1'],
        ['PRAGMA', 'PRAGMA foreign_keys = ON'],
        ['bare operation', 'BEGIN'],
        ['empty query', ''],
      ])('instruments %s', (_label, query) => {
        expect(execCreatesSpan(query)).toBe(true);
      });
    });

    describe('durableObjectSqlSpanAllowlist (opt a cf_ table back into instrumentation)', () => {
      it.each([
        ['exact string', 'SELECT * FROM cf_my_table', ['cf_my_table']],
        ['regex', 'SELECT * FROM cf_reports_daily', [/^cf_reports_/]],
        ['upsert target', 'INSERT OR REPLACE INTO cf_my_table (id) VALUES (?)', ['cf_my_table']],
        ['CREATE INDEX target', 'CREATE INDEX idx_mine ON cf_my_table (id)', ['cf_my_table']],
      ])('instruments an allowlisted table matched by %s', (_label, query, allowlist) => {
        expect(execCreatesSpan(query, allowlist)).toBe(true);
      });

      it.each([
        // Substring matches must not opt a table back in, otherwise `cf_` would allowlist everything.
        ['a string entry only matches exactly', 'SELECT * FROM cf_agents_state', ['cf_agents']],
        ['a non-matching entry leaves internal tables skipped', 'SELECT * FROM cf_agents_state', ['cf_my_table']],
        [
          'an internal table joined with an allowlisted table is still skipped',
          'SELECT * FROM cf_my_table t JOIN cf_agents_state s ON s.id = t.id',
          ['cf_my_table'],
        ],
        ['an empty allowlist is ignored', 'SELECT * FROM cf_agents_state', []],
      ])('%s', (_label, query, allowlist) => {
        expect(execCreatesSpan(query, allowlist)).toBe(false);
      });
    });
  });
});

/**
 * Runs a query through the real `instrumentSqlStorage` proxy and reports whether it produced a
 * `db.query` span, so the filtering matrix exercises the actual code path rather than a
 * reimplementation of it.
 */
function execCreatesSpan(query: string, allowlist?: Array<string | RegExp>): boolean {
  const startSpanSpy = vi.spyOn(sentryCore, 'startSpan');

  if (allowlist) {
    vi.spyOn(sentryCore, 'getClient').mockReturnValue({
      getOptions: () => ({ durableObjectSqlSpanAllowlist: allowlist }),
    } as unknown as ReturnType<typeof sentryCore.getClient>);
  }

  const mockSql = createMockSqlStorage();
  instrumentSqlStorage(mockSql).exec(query);

  expect(mockSql.exec).toHaveBeenCalledWith(query);

  return startSpanSpy.mock.calls.length > 0;
}

function createMockCursor() {
  return {
    next: vi.fn(),
    toArray: vi.fn().mockReturnValue([]),
    one: vi.fn(),
    raw: vi.fn(),
    columnNames: [],
    rowsRead: 0,
    rowsWritten: 0,
  };
}

function createMockSqlStorage(cursor?: ReturnType<typeof createMockCursor>): any {
  return {
    exec: vi.fn().mockReturnValue(cursor ?? createMockCursor()),
    databaseSize: 1024,
    Cursor: class {},
    Statement: class {},
  };
}
