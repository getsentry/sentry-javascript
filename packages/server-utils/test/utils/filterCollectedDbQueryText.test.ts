import type { Client } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { filterCollectedDbQueryText } from '../../src/utils/filterCollectedDbQueryText';

const QUERY = "SELECT * FROM users WHERE email = 'jane@example.com'";

function mockClient(databaseQueryData: boolean): Client {
  return { getDataCollectionOptions: () => ({ databaseQueryData }) } as unknown as Client;
}

describe('filterCollectedDbQueryText', () => {
  it('returns undefined for an absent statement', () => {
    expect(filterCollectedDbQueryText(undefined, undefined, mockClient(true))).toBeUndefined();
  });

  it('keeps inline literals when databaseQueryData is on', () => {
    expect(filterCollectedDbQueryText(QUERY, undefined, mockClient(true))).toBe(QUERY);
  });

  it('sanitizes inline literals when databaseQueryData is off', () => {
    expect(filterCollectedDbQueryText(QUERY, undefined, mockClient(false))).toBe('SELECT * FROM users WHERE email = ?');
  });
});
