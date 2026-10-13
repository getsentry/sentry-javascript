import { describe, expect, it } from 'vitest';
import { mayTargetCloudflareInternalTable, targetsCloudflareInternalTable } from '../../src/utils/internalSqlQuery';

// Behavioural coverage of the filter lives in `instrumentSqlStorage.test.ts`, which drives real
// queries through the instrumented `exec`. What remains here are the signature-level contracts that
// call path cannot reach: an absent summary, and an absent `queryText`.
describe('targetsCloudflareInternalTable', () => {
  it.each([
    ['undefined', undefined],
    ['empty', ''],
  ])('returns false for a %s summary', (_label, summary) => {
    expect(targetsCloudflareInternalTable(summary)).toBe(false);
  });

  it('falls back to the summary when no queryText is passed', () => {
    expect(targetsCloudflareInternalTable('SELECT cf_agents_state')).toBe(true);
    expect(targetsCloudflareInternalTable('SELECT users')).toBe(false);
  });

  // Without queryText a CREATE INDEX summary carries the index name, so the cf_ table in the ON
  // clause is invisible and the query is instrumented — the caller must pass queryText to filter it.
  it('cannot resolve a CREATE INDEX target from the summary alone', () => {
    expect(targetsCloudflareInternalTable('CREATE INDEX idx_agents_state_id')).toBe(false);
  });
});

describe('mayTargetCloudflareInternalTable', () => {
  it.each([
    ['a cf_ table', 'SELECT * FROM cf_agents_state WHERE id = ?'],
    ['an uppercase CF_ table', 'select * from CF_AGENTS_STATE'],
    ['a quoted cf_ table', 'SELECT * FROM "cf_agents_state"'],
    ['a schema-qualified cf_ table', 'SELECT * FROM main.cf_agents_state'],
    ['a cf_ table in a CREATE INDEX ON clause', 'CREATE INDEX idx_agents_state_id ON cf_agents_state (id)'],
    ['a pi_ table', 'SELECT record FROM pi_tasks WHERE id = ?'],
  ])('returns true for %s', (_label, query) => {
    expect(mayTargetCloudflareInternalTable(query)).toBe(true);
  });

  it.each([
    ['a user table', 'SELECT * FROM users WHERE id = ?'],
    ['a table with cf in the middle', 'SELECT * FROM my_cf_table'],
    ['a table starting with cfg', 'SELECT * FROM cfg_settings'],
    ['a table with pi_ in the middle', 'SELECT * FROM api_keys'],
  ])('returns false for %s', (_label, query) => {
    expect(mayTargetCloudflareInternalTable(query)).toBe(false);
  });
});
