import {
  COUNTER_METRIC_TYPE,
  DISTRIBUTION_METRIC_TYPE,
  GAUGE_METRIC_TYPE,
  SET_METRIC_TYPE,
} from '../../../src/metrics/constants';
import { getBucketKey, sanitizeTags } from '../../../src/metrics/utils';

describe('getBucketKey', () => {
  it.each([
    [COUNTER_METRIC_TYPE, 'requests', 'none', {}, 'crequestsnone'],
    [GAUGE_METRIC_TYPE, 'cpu', 'none', {}, 'gcpunone'],
    [DISTRIBUTION_METRIC_TYPE, 'lcp', 'second', { a: 'value', b: 'anothervalue' }, 'dlcpseconda,value,b,anothervalue'],
    [DISTRIBUTION_METRIC_TYPE, 'lcp', 'second', { b: 'anothervalue', a: 'value' }, 'dlcpseconda,value,b,anothervalue'],
    [DISTRIBUTION_METRIC_TYPE, 'lcp', 'second', { a: '1', b: '2', c: '3' }, 'dlcpseconda,1,b,2,c,3'],
    [DISTRIBUTION_METRIC_TYPE, 'lcp', 'second', { numericKey: '2' }, 'dlcpsecondnumericKey,2'],
    [SET_METRIC_TYPE, 'important_org_ids', 'none', { numericKey: '2' }, 'simportant_org_idsnonenumericKey,2'],
  ])('should return', (metricType, name, unit, tags, expected) => {
    expect(getBucketKey(metricType, name, unit, tags)).toEqual(expected);
  });

  it('should sanitize tags', () => {
    const inputTags = {
      'f-oo|bar': '%$foo/',
      'foo$.$.$bar': 'blah{}',
      'foö-bar': 'snöwmän',
      route: 'GET /foo',
      __bar__: 'this | or , that',
      'foo/': 'hello!\n\r\t\\',
    };

    const outputTags = {
      'f-oobar': '%$foo/',
      'foo..bar': 'blah{}',
      'fo-bar': 'snöwmän',
      route: 'GET /foo',
      __bar__: 'this \\u{7c} or \\u{2c} that',
      'foo/': 'hello!\\n\\r\\t\\\\',
    };

    expect(sanitizeTags(inputTags)).toEqual(outputTags);
  });
});
