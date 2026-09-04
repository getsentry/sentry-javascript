import { describe, expect, it } from 'vitest';
import type { Client } from '../../../../src/client';
import type { DataCollection } from '../../../../src/types/datacollection';
import { filterCollectedDbQueryText } from '../../../../src/utils/data-collection/filterCollectedDbQueryText';
import { resolveDataCollectionOptions } from '../../../../src/utils/data-collection/resolveDataCollectionOptions';

function mockClient(dataCollection?: DataCollection): Client {
  return { getDataCollectionOptions: () => resolveDataCollectionOptions({ dataCollection }) } as unknown as Client;
}

describe('filterCollectedDbQueryText', () => {
  it('returns undefined for an absent statement', () => {
    expect(filterCollectedDbQueryText(undefined, undefined, mockClient())).toBeUndefined();
  });

  it('keeps inline literals by default', () => {
    expect(
      filterCollectedDbQueryText("SELECT * FROM users WHERE email = 'jane@example.com'", undefined, mockClient()),
    ).toBe("SELECT * FROM users WHERE email = 'jane@example.com'");
  });

  it('sanitizes inline literals when databaseQueryData is off', () => {
    expect(
      filterCollectedDbQueryText("SELECT * FROM users WHERE email = 'jane@example.com'", undefined, {
        ...mockClient({ databaseQueryData: false }),
      }),
    ).toBe('SELECT * FROM users WHERE email = ?');
  });
});
