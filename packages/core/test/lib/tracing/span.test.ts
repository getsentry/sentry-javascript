import { timestampInSeconds } from '@sentry/utils';
import { Span } from '../../../src';
import { TRACE_FLAG_NONE, TRACE_FLAG_SAMPLED, spanToJSON } from '../../../src/utils/spanUtils';

describe('span', () => {
  describe('name', () => {
    /* eslint-disable deprecation/deprecation */
    it('works with name', () => {
      const span = new Span({ name: 'span name' });
      expect(span.name).toEqual('span name');
      expect(span.description).toEqual('span name');
    });

    it('works with description', () => {
      const span = new Span({ description: 'span name' });
      expect(span.name).toEqual('span name');
      expect(span.description).toEqual('span name');
    });

    it('works without name', () => {
      const span = new Span({});
      expect(span.name).toEqual('');
      expect(span.description).toEqual(undefined);
    });

    it('allows to update the name via setter', () => {
      const span = new Span({ name: 'span name' });
      expect(span.name).toEqual('span name');
      expect(span.description).toEqual('span name');

      span.name = 'new name';

      expect(span.name).toEqual('new name');
      expect(span.description).toEqual('new name');
    });

    it('allows to update the name via setName', () => {
      const span = new Span({ name: 'span name' });
      expect(span.name).toEqual('span name');
      expect(span.description).toEqual('span name');

      // eslint-disable-next-line deprecation/deprecation
      span.setName('new name');

      expect(span.name).toEqual('new name');
      expect(span.description).toEqual('new name');
    });

    it('allows to update the name via updateName', () => {
      const span = new Span({ name: 'span name' });
      expect(span.name).toEqual('span name');
      expect(span.description).toEqual('span name');

      span.updateName('new name');

      expect(span.name).toEqual('new name');
      expect(span.description).toEqual('new name');
    });
  });
  /* eslint-enable deprecation/deprecation */

  describe('setAttribute', () => {
    it('allows to set attributes', () => {
      const span = new Span();

      span.setAttribute('str', 'bar');
      span.setAttribute('num', 1);
      span.setAttribute('zero', 0);
      span.setAttribute('bool', true);
      span.setAttribute('false', false);
      span.setAttribute('undefined', undefined);
      span.setAttribute('numArray', [1, 2]);
      span.setAttribute('strArray', ['aa', 'bb']);
      span.setAttribute('boolArray', [true, false]);
      span.setAttribute('arrayWithUndefined', [1, undefined, 2]);

      expect(span['_attributes']).toEqual({
        str: 'bar',
        num: 1,
        zero: 0,
        bool: true,
        false: false,
        numArray: [1, 2],
        strArray: ['aa', 'bb'],
        boolArray: [true, false],
        arrayWithUndefined: [1, undefined, 2],
        // origin is set by default to 'manual' in the Span constructor
        'sentry.origin': 'manual',
      });
    });

    it('deletes attributes when setting to `undefined`', () => {
      const span = new Span();

      span.setAttribute('str', 'bar');

      // length 2 because `sentry.origin` is always set by default
      expect(Object.keys(span['_attributes']).length).toEqual(2);

      span.setAttribute('str', undefined);

      expect(Object.keys(span['_attributes']).length).toEqual(1);
    });

    it('disallows invalid attribute types', () => {
      const span = new Span();

      /** @ts-expect-error this is invalid */
      span.setAttribute('str', null);

      /** @ts-expect-error this is invalid */
      span.setAttribute('str', [1, 'a']);
    });
  });

  describe('setAttributes', () => {
    it('allows to set attributes', () => {
      const span = new Span();

      const initialAttributes = span['_attributes'];

      expect(initialAttributes).toEqual({
        // origin is set by default to 'manual' in the Span constructor
        'sentry.origin': 'manual',
      });

      const newAttributes = {
        str: 'bar',
        num: 1,
        zero: 0,
        bool: true,
        false: false,
        undefined: undefined,
        numArray: [1, 2],
        strArray: ['aa', 'bb'],
        boolArray: [true, false],
        arrayWithUndefined: [1, undefined, 2],
      };
      span.setAttributes(newAttributes);

      expect(span['_attributes']).toEqual({
        str: 'bar',
        num: 1,
        zero: 0,
        bool: true,
        false: false,
        numArray: [1, 2],
        strArray: ['aa', 'bb'],
        boolArray: [true, false],
        arrayWithUndefined: [1, undefined, 2],
        'sentry.origin': 'manual',
      });

      expect(span['_attributes']).not.toBe(newAttributes);

      span.setAttributes({
        num: 2,
        numArray: [3, 4],
      });

      expect(span['_attributes']).toEqual({
        str: 'bar',
        num: 2,
        zero: 0,
        bool: true,
        false: false,
        numArray: [3, 4],
        strArray: ['aa', 'bb'],
        boolArray: [true, false],
        arrayWithUndefined: [1, undefined, 2],
        'sentry.origin': 'manual',
      });
    });

    it('deletes attributes when setting to `undefined`', () => {
      const span = new Span();

      span.setAttribute('str', 'bar');

      // length 2 because `sentry.origin` is always set by default
      expect(Object.keys(span['_attributes']).length).toEqual(2);

      span.setAttributes({ str: undefined });

      expect(Object.keys(span['_attributes']).length).toEqual(1);
    });
  });

  describe('end', () => {
    it('works without endTimestamp', () => {
      const span = new Span();
      const now = timestampInSeconds();
      span.end();

      expect(spanToJSON(span).timestamp).toBeGreaterThanOrEqual(now);
    });

    it('works with endTimestamp in seconds', () => {
      const span = new Span();
      const timestamp = timestampInSeconds() - 1;
      span.end(timestamp);

      expect(spanToJSON(span).timestamp).toEqual(timestamp);
    });

    it('works with endTimestamp in milliseconds', () => {
      const span = new Span();
      const timestamp = Date.now() - 1000;
      span.end(timestamp);

      expect(spanToJSON(span).timestamp).toEqual(timestamp / 1000);
    });

    it('works with endTimestamp in array form', () => {
      const span = new Span();
      const seconds = Math.floor(timestampInSeconds() - 1);
      span.end([seconds, 0]);

      expect(spanToJSON(span).timestamp).toEqual(seconds);
    });

    it('skips if span is already ended', () => {
      const startTimestamp = timestampInSeconds() - 5;
      const endTimestamp = timestampInSeconds() - 1;
      const span = new Span({ startTimestamp, endTimestamp });

      span.end();

      expect(spanToJSON(span).timestamp).toBe(endTimestamp);
    });
  });

  describe('isRecording', () => {
    it('returns true for sampled span', () => {
      const span = new Span({ sampled: true });
      expect(span.isRecording()).toEqual(true);
    });

    it('returns false for sampled, finished span', () => {
      const span = new Span({ sampled: true, endTimestamp: Date.now() });
      expect(span.isRecording()).toEqual(false);
    });

    it('returns false for unsampled span', () => {
      const span = new Span({ sampled: false });
      expect(span.isRecording()).toEqual(false);
    });
  });

  describe('spanContext', () => {
    it('works with default span', () => {
      const span = new Span();
      expect(span.spanContext()).toEqual({
        spanId: span['_spanId'],
        traceId: span['_traceId'],
        traceFlags: TRACE_FLAG_NONE,
      });
    });

    it('works sampled span', () => {
      const span = new Span({ sampled: true });
      expect(span.spanContext()).toEqual({
        spanId: span['_spanId'],
        traceId: span['_traceId'],
        traceFlags: TRACE_FLAG_SAMPLED,
      });
    });

    it('works unsampled span', () => {
      const span = new Span({ sampled: false });
      expect(span.spanContext()).toEqual({
        spanId: span['_spanId'],
        traceId: span['_traceId'],
        traceFlags: TRACE_FLAG_NONE,
      });
    });
  });

  // Ensure that attributes & data are merged together
  describe('_getData', () => {
    it('works without data & attributes', () => {
      const span = new Span();

      expect(span['_getData']()).toEqual({
        // origin is set by default to 'manual' in the Span constructor
        'sentry.origin': 'manual',
      });
    });

    it('works with data only', () => {
      const span = new Span();
      // eslint-disable-next-line deprecation/deprecation
      span.setData('foo', 'bar');

      expect(span['_getData']()).toEqual({
        foo: 'bar',
        // origin is set by default to 'manual' in the Span constructor
        'sentry.origin': 'manual',
      });
      expect(span['_getData']()).toStrictEqual({
        // eslint-disable-next-line deprecation/deprecation
        ...span.data,
        'sentry.origin': 'manual',
      });
    });

    it('works with attributes only', () => {
      const span = new Span();
      span.setAttribute('foo', 'bar');

      expect(span['_getData']()).toEqual({
        foo: 'bar',
        // origin is set by default to 'manual' in the Span constructor
        'sentry.origin': 'manual',
      });
      // eslint-disable-next-line deprecation/deprecation
      expect(span['_getData']()).toBe(span.attributes);
    });

    it('merges data & attributes', () => {
      const span = new Span();
      span.setAttribute('foo', 'foo');
      span.setAttribute('bar', 'bar');
      // eslint-disable-next-line deprecation/deprecation
      span.setData('foo', 'foo2');
      // eslint-disable-next-line deprecation/deprecation
      span.setData('baz', 'baz');

      expect(span['_getData']()).toEqual({
        foo: 'foo',
        bar: 'bar',
        baz: 'baz',
        // origin is set by default to 'manual' in the Span constructor
        'sentry.origin': 'manual',
      });
      // eslint-disable-next-line deprecation/deprecation
      expect(span['_getData']()).not.toBe(span.attributes);
      // eslint-disable-next-line deprecation/deprecation
      expect(span['_getData']()).not.toBe(span.data);
    });
  });
});
