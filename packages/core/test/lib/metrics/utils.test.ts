import {
  COUNTER_METRIC_TYPE,
  DISTRIBUTION_METRIC_TYPE,
  GAUGE_METRIC_TYPE,
  SET_METRIC_TYPE,
} from '../../../src/metrics/constants';
import { getBucketKey } from '../../../src/metrics/utils';

describe('getBucketKey', () => {
  it.each([
    [COUNTER_METRIC_TYPE, 'requests', 'none', {}, 'crequestsnone'],
    [GAUGE_METRIC_TYPE, 'cpu', 'none', {}, 'gcpunone'],
    [DISTRIBUTION_METRIC_TYPE, 'lcp', 'second', { a: 'value', b: 'anothervalue' }, 'dlcpseconda,valueb,anothervalue'],
    [DISTRIBUTION_METRIC_TYPE, 'lcp', 'second', { a: 'value', b: 'anothervalue' }, 'dlcpseconda,valueb,anothervalue'],
    [DISTRIBUTION_METRIC_TYPE, 'lcp', 'second', { numericKey: '2' }, 'dlcpsecondnumericKey,2'],
    [SET_METRIC_TYPE, 'important_org_ids', 'none', { numericKey: '2' }, 'simportant_org_idsnonenumericKey,2'],
  ])('should return', (metricType, name, unit, tags, expected) => {
    expect(getBucketKey(metricType, name, unit, tags)).toEqual(expected);
  });
});
