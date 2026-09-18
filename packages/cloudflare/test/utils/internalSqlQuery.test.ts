import { describe, expect, it } from 'vitest';
import { targetsCloudflareInternalTable } from '../../src/utils/internalSqlQuery';

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
