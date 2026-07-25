import { _INTERNAL_getSqlQuerySummary, _INTERNAL_sanitizeSqlQuery } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { targetsCloudflareInternalTable } from '../../src/utils/internalSqlQuery';

// Runs the same sanitize -> summarize -> filter pipeline as `instrumentSqlStorage`, so the tests
// exercise the real detection path rather than hand-written summaries.
const check = (query: string, allowlist?: Array<string | RegExp>): boolean => {
  const sanitized = _INTERNAL_sanitizeSqlQuery(query);
  return targetsCloudflareInternalTable(_INTERNAL_getSqlQuerySummary(sanitized), allowlist, sanitized);
};

describe('targetsCloudflareInternalTable', () => {
  describe('internal queries (cf_ tables)', () => {
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
    ])('returns true for %s on internal tables', (_label, query) => {
      expect(check(query)).toBe(true);
    });

    // The summary of a CREATE INDEX carries the index name, not the indexed table — the cf_
    // target only exists in the ON clause of the full statement.
    it.each([
      [
        'framework statement',
        `create index if not exists idx_ai_chat_agent_tool_request_id
          on cf_ai_chat_agent_tool_runs(request_id)`,
      ],
      ['uppercase', 'CREATE INDEX idx_agents_state_id ON cf_agents_state (id)'],
      ['UNIQUE', 'CREATE UNIQUE INDEX idx_agents_state_id ON cf_agents_state (id)'],
      ['without IF NOT EXISTS', 'CREATE INDEX idx_chunks_stream ON cf_ai_chat_stream_chunks (stream_id)'],
    ])('returns true for CREATE INDEX (%s) on an internal table', (_label, query) => {
      expect(check(query)).toBe(true);
    });

    it('returns true for an internal JOIN', () => {
      const query = `
        SELECT f.fiber_id, f.status
        FROM cf_agents_fibers f
        LEFT JOIN cf_agents_runs r ON r.id = f.fiber_id
        WHERE f.status IN ('pending', 'running')
      `;
      expect(check(query)).toBe(true);
    });

    it('returns true when an internal table is joined with a user table', () => {
      // `.some()` — any internal table present means the query is framework-driven noise.
      expect(check('SELECT * FROM cf_agents_state s JOIN users u ON u.id = s.id')).toBe(true);
    });

    it('handles case-insensitive keywords and prefixes', () => {
      expect(check('select * from CF_AGENTS_STATE')).toBe(true);
    });
  });

  describe('user queries (must be instrumented)', () => {
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
    ])('returns false for %s on user tables', (_label, query) => {
      expect(check(query)).toBe(false);
    });
  });

  describe('allowlist (opt a cf_ table back into instrumentation)', () => {
    it('returns false for an allowlisted table matched by exact string', () => {
      expect(check('SELECT * FROM cf_my_table', ['cf_my_table'])).toBe(false);
    });

    it('returns false for an allowlisted table matched by regex', () => {
      expect(check('SELECT * FROM cf_reports_daily', [/^cf_reports_/])).toBe(false);
    });

    it('returns false for an allowlisted table targeted by an upsert', () => {
      expect(check('INSERT OR REPLACE INTO cf_my_table (id) VALUES (?)', ['cf_my_table'])).toBe(false);
    });

    it('returns false for CREATE INDEX on an allowlisted table', () => {
      expect(check('CREATE INDEX idx_mine ON cf_my_table (id)', ['cf_my_table'])).toBe(false);
    });

    it('requires an exact match for string entries', () => {
      // Substring matches must not opt a table back in, otherwise `cf_` would allowlist everything.
      expect(check('SELECT * FROM cf_agents_state', ['cf_agents'])).toBe(true);
    });

    it('still skips genuine internal tables that are not allowlisted', () => {
      expect(check('SELECT * FROM cf_agents_state', ['cf_my_table'])).toBe(true);
    });

    it('still skips when an internal table is joined with an allowlisted table', () => {
      expect(check('SELECT * FROM cf_my_table t JOIN cf_agents_state s ON s.id = t.id', ['cf_my_table'])).toBe(true);
    });

    it('ignores an empty allowlist', () => {
      expect(check('SELECT * FROM cf_agents_state', [])).toBe(true);
    });
  });

  describe('summaries without a resolvable table target (safe default: instrument)', () => {
    it.each([
      ['no-table SELECT', 'SELECT 1'],
      ['PRAGMA', 'PRAGMA foreign_keys = ON'],
      ['bare operation', 'BEGIN'],
    ])('returns false for %s', (_label, query) => {
      expect(check(query)).toBe(false);
    });

    it.each([
      ['undefined', undefined],
      ['empty', ''],
    ])('returns false for a %s summary', (_label, summary) => {
      expect(targetsCloudflareInternalTable(summary)).toBe(false);
    });
  });
});
