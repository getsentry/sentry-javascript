import { _INTERNAL_getSqlQuerySummary } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { targetsCloudflareInternalTable } from '../../src/utils/internalSqlQuery';

// Builds the summary the same way `instrumentSqlStorage` does, so the test exercises the real
// operation -> summary -> detection path rather than hand-written summaries.
const summarize = (query: string): string | undefined => _INTERNAL_getSqlQuerySummary(query);

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
    ])('returns true for %s on internal tables', (_label, query) => {
      expect(targetsCloudflareInternalTable(summarize(query))).toBe(true);
    });

    it('returns true for an internal JOIN', () => {
      const query = `
        SELECT f.fiber_id, f.status
        FROM cf_agents_fibers f
        LEFT JOIN cf_agents_runs r ON r.id = f.fiber_id
        WHERE f.status IN ('pending', 'running')
      `;
      expect(targetsCloudflareInternalTable(summarize(query))).toBe(true);
    });

    it('returns true when an internal table is joined with a user table', () => {
      // `.some()` — any internal table present means the query is framework-driven noise.
      expect(
        targetsCloudflareInternalTable(summarize('SELECT * FROM cf_agents_state s JOIN users u ON u.id = s.id')),
      ).toBe(true);
    });

    it('handles case-insensitive keywords and prefixes', () => {
      expect(targetsCloudflareInternalTable(summarize('select * from CF_AGENTS_STATE'))).toBe(true);
    });
  });

  describe('user queries (must be instrumented)', () => {
    it.each([
      ['SELECT', 'SELECT * FROM users WHERE id = ?'],
      ['INSERT', 'INSERT INTO orders (id, total) VALUES (?, ?)'],
      ['UPDATE', 'UPDATE products SET price = ? WHERE id = ?'],
      ['DELETE', 'DELETE FROM sessions WHERE expired = 1'],
      ['CREATE TABLE', 'CREATE TABLE users (id TEXT PRIMARY KEY)'],
      ['table with cf in the middle', 'SELECT * FROM my_cf_table'],
      ['table starting with cfg', 'SELECT * FROM cfg_settings'],
    ])('returns false for %s on user tables', (_label, query) => {
      expect(targetsCloudflareInternalTable(summarize(query))).toBe(false);
    });
  });

  describe('allowlist (opt a cf_ table back into instrumentation)', () => {
    it('returns false for an allowlisted table matched by exact string', () => {
      expect(targetsCloudflareInternalTable(summarize('SELECT * FROM cf_my_table'), ['cf_my_table'])).toBe(false);
    });

    it('returns false for an allowlisted table matched by regex', () => {
      expect(targetsCloudflareInternalTable(summarize('SELECT * FROM cf_reports_daily'), [/^cf_reports_/])).toBe(false);
    });

    it('requires an exact match for string entries', () => {
      // Substring matches must not opt a table back in, otherwise `cf_` would allowlist everything.
      expect(targetsCloudflareInternalTable(summarize('SELECT * FROM cf_agents_state'), ['cf_agents'])).toBe(true);
    });

    it('still skips genuine internal tables that are not allowlisted', () => {
      expect(targetsCloudflareInternalTable(summarize('SELECT * FROM cf_agents_state'), ['cf_my_table'])).toBe(true);
    });

    it('still skips when an internal table is joined with an allowlisted table', () => {
      expect(
        targetsCloudflareInternalTable(summarize('SELECT * FROM cf_my_table t JOIN cf_agents_state s ON s.id = t.id'), [
          'cf_my_table',
        ]),
      ).toBe(true);
    });

    it('ignores an empty allowlist', () => {
      expect(targetsCloudflareInternalTable(summarize('SELECT * FROM cf_agents_state'), [])).toBe(true);
    });
  });

  describe('summaries without a resolvable table target (safe default: instrument)', () => {
    it.each([
      ['undefined', undefined],
      ['empty', ''],
      ['no-table SELECT', 'SELECT 1'],
      ['PRAGMA', 'PRAGMA foreign_keys = ON'],
      ['bare operation', 'BEGIN'],
    ])('returns false for %s', (_label, value) => {
      const summary = typeof value === 'string' ? summarize(value) : value;
      expect(targetsCloudflareInternalTable(summary)).toBe(false);
    });
  });
});
