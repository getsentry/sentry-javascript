import { getBucketKey } from '../../../src/metrics/utils';

describe('getBucketKey', () => {
  it.each([
    ['c' as const, 'requests', 'none', {}, 'crequestsnone'],
    ['g' as const, 'cpu', 'none', {}, 'gcpunone'],
    ['d' as const, 'lcp', 'second', { a: 'value', b: 'anothervalue' }, 'dlcpseconda,valueb,anothervalue'],
    ['d' as const, 'lcp', 'second', { a: 'value', b: 'anothervalue' }, 'dlcpseconda,valueb,anothervalue'],
    ['d' as const, 'lcp', 'second', { numericKey: 2 }, 'dlcpsecondnumericKey,2'],
    ['d' as const, 'lcp', 'second', { undefinedKey: undefined, numericKey: 2 }, 'dlcpsecondnumericKey,2'],
    [
      's' as const,
      'important_org_ids',
      'none',
      { undefinedKey: undefined, numericKey: 2 },
      'simportant_org_idsnonenumericKey,2',
    ],
  ])('should return', (metricType, name, unit, tags, expected) => {
    expect(getBucketKey(metricType, name, unit, tags)).toEqual(expected);
  });
});
