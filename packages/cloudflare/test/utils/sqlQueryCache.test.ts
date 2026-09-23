import * as serverUtils from '@sentry/server-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSanitizedSqlQuery } from '../../src/utils/sqlQueryCache';

describe('getSanitizedSqlQuery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the sanitized statement and its summary', () => {
    expect(getSanitizedSqlQuery("SELECT * FROM users WHERE name = 'Alice'")).toEqual({
      text: 'SELECT * FROM users WHERE name = ?',
      summary: 'SELECT users',
    });
  });

  it('sanitizes a repeated statement only once', () => {
    const sanitizeSpy = vi.spyOn(serverUtils, 'sanitizeSqlQuery');
    const query = 'SELECT * FROM cache_test_orders WHERE id = ?';

    const first = getSanitizedSqlQuery(query);
    const second = getSanitizedSqlQuery(query);

    expect(second).toBe(first);
    expect(sanitizeSpy).toHaveBeenCalledTimes(1);
  });

  it('does not cache statements longer than 2000 characters', () => {
    const sanitizeSpy = vi.spyOn(serverUtils, 'sanitizeSqlQuery');
    const query = `SELECT * FROM cache_test_long WHERE id IN (${'1, '.repeat(700)}1)`;

    getSanitizedSqlQuery(query);
    getSanitizedSqlQuery(query);

    expect(sanitizeSpy).toHaveBeenCalledTimes(2);
  });

  it('keeps at most 200 statements', () => {
    const sanitizeSpy = vi.spyOn(serverUtils, 'sanitizeSqlQuery');
    const firstQuery = 'SELECT * FROM cache_test_bound_0';

    getSanitizedSqlQuery(firstQuery);
    for (let i = 1; i <= 200; i++) {
      getSanitizedSqlQuery(`SELECT * FROM cache_test_bound_${i}`);
    }
    getSanitizedSqlQuery(firstQuery);

    expect(sanitizeSpy).toHaveBeenCalledTimes(202);
  });
});
