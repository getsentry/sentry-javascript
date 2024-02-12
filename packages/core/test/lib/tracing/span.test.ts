import { TRACEPARENT_REGEXP, timestampInSeconds } from '@sentry/utils';
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

  describe('new Span', () => {
    test('simple', () => {
      const span = new Span({ sampled: true });
      const span2 = span.startChild();
      expect((span2 as any).parentSpanId).toBe((span as any).spanId);
      expect((span2 as any).traceId).toBe((span as any).traceId);
      expect((span2 as any).sampled).toBe((span as any).sampled);
    });

    test('sets instrumenter to `sentry` if not specified in constructor', () => {
      const span = new Span({});

      expect(span.instrumenter).toBe('sentry');
    });

    test('allows to set instrumenter in constructor', () => {
      const span = new Span({ instrumenter: 'otel' });

      expect(span.instrumenter).toBe('otel');
    });
  });

  describe('setters', () => {
    test('setTag', () => {
      const span = new Span({});
      expect(span.tags.foo).toBeUndefined();
      span.setTag('foo', 'bar');
      expect(span.tags.foo).toBe('bar');
      span.setTag('foo', 'baz');
      expect(span.tags.foo).toBe('baz');
    });

    test('setData', () => {
      const span = new Span({});
      expect(span.data.foo).toBeUndefined();
      span.setData('foo', null);
      expect(span.data.foo).toBe(null);
      span.setData('foo', 2);
      expect(span.data.foo).toBe(2);
      span.setData('foo', true);
      expect(span.data.foo).toBe(true);
    });

    test('setName', () => {
      const span = new Span({});
      expect(span.description).toBeUndefined();
      span.updateName('foo');
      expect(span.description).toBe('foo');
    });
  });

  describe('status', () => {
    test('setStatus', () => {
      const span = new Span({});
      span.setStatus('permission_denied');
      expect((span.getTraceContext() as any).status).toBe('permission_denied');
    });

    // TODO (v8): Remove
    test('setHttpStatus', () => {
      const span = new Span({});
      span.setHttpStatus(404);
      expect((span.getTraceContext() as any).status).toBe('not_found');
      expect(span.tags['http.status_code']).toBe('404');
      expect(span.data['http.response.status_code']).toBe(404);
    });

    // TODO (v8): Remove
    test('isSuccess', () => {
      const span = new Span({});
      expect(span.isSuccess()).toBe(false);
      expect(spanToJSON(span).status).not.toBe('ok');
      span.setHttpStatus(200);
      expect(span.isSuccess()).toBe(true);
      expect(spanToJSON(span).status).toBe('ok');
      span.setStatus('permission_denied');
      expect(span.isSuccess()).toBe(false);
      expect(spanToJSON(span).status).not.toBe('ok');
      span.setHttpStatus(0);
      expect(span.isSuccess()).toBe(false);
      expect(spanToJSON(span).status).not.toBe('ok');
      span.setHttpStatus(-1);
      expect(span.isSuccess()).toBe(false);
      expect(spanToJSON(span).status).not.toBe('ok');
      span.setHttpStatus(99);
      expect(span.isSuccess()).toBe(false);
      expect(spanToJSON(span).status).not.toBe('ok');
      span.setHttpStatus(100);
      expect(span.isSuccess()).toBe(true);
      expect(spanToJSON(span).status).toBe('ok');
    });
  });

  describe('toTraceparent', () => {
    test('simple', () => {
      expect(new Span().toTraceparent()).toMatch(TRACEPARENT_REGEXP);
    });
    test('with sample', () => {
      expect(new Span({ sampled: true }).toTraceparent()).toMatch(TRACEPARENT_REGEXP);
    });
  });

  describe('toJSON', () => {
    test('simple', () => {
      const span = JSON.parse(
        JSON.stringify(new Span({ traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', spanId: 'bbbbbbbbbbbbbbbb' })),
      );
      expect(span).toHaveProperty('span_id', 'bbbbbbbbbbbbbbbb');
      expect(span).toHaveProperty('trace_id', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    });

    test('with parent', () => {
      const spanA = new Span({ traceId: 'a', spanId: 'b' }) as any;
      const spanB = new Span({ traceId: 'c', spanId: 'd', sampled: false, parentSpanId: spanA.spanId });
      const serialized = JSON.parse(JSON.stringify(spanB));
      expect(serialized).toHaveProperty('parent_span_id', 'b');
      expect(serialized).toHaveProperty('span_id', 'd');
      expect(serialized).toHaveProperty('trace_id', 'c');
    });

    test('should drop all `undefined` values', () => {
      const spanA = new Span({ traceId: 'a', spanId: 'b' }) as any;
      const spanB = new Span({
        parentSpanId: spanA.spanId,
        spanId: 'd',
        traceId: 'c',
      });
      const serialized = spanB.toJSON();
      expect(serialized).toStrictEqual({
        start_timestamp: expect.any(Number),
        parent_span_id: 'b',
        span_id: 'd',
        trace_id: 'c',
        origin: 'manual',
        data: {
          'sentry.origin': 'manual',
        },
      });
    });
  });

  describe('finish', () => {
    test('simple', () => {
      const span = new Span({});
      expect(spanToJSON(span).timestamp).toBeUndefined();
      span.end();
      expect(spanToJSON(span).timestamp).toBeGreaterThan(1);
    });
  });

  describe('end', () => {
    test('simple', () => {
      const span = new Span({});
      expect(spanToJSON(span).timestamp).toBeUndefined();
      span.end();
      expect(spanToJSON(span).timestamp).toBeGreaterThan(1);
    });

    test('with endTime in seconds', () => {
      const span = new Span({});
      expect(spanToJSON(span).timestamp).toBeUndefined();
      const endTime = Date.now() / 1000;
      span.end(endTime);
      expect(spanToJSON(span).timestamp).toBe(endTime);
    });

    test('with endTime in milliseconds', () => {
      const span = new Span({});
      expect(spanToJSON(span).timestamp).toBeUndefined();
      const endTime = Date.now();
      span.end(endTime);
      expect(spanToJSON(span).timestamp).toBe(endTime / 1000);
    });
  });

  describe('getTraceContext', () => {
    test('should have status attribute undefined if no status tag is available', () => {
      const span = new Span({});
      const context = span.getTraceContext();
      expect((context as any).status).toBeUndefined();
    });

    test('should have success status extracted from tags', () => {
      const span = new Span({});
      span.setStatus('ok');
      const context = span.getTraceContext();
      expect((context as any).status).toBe('ok');
    });

    test('should have failure status extracted from tags', () => {
      const span = new Span({});
      span.setStatus('resource_exhausted');
      const context = span.getTraceContext();
      expect((context as any).status).toBe('resource_exhausted');
    });

    test('should drop all `undefined` values', () => {
      const spanB = new Span({ spanId: 'd', traceId: 'c' });
      const context = spanB.getTraceContext();
      expect(context).toStrictEqual({
        span_id: 'd',
        trace_id: 'c',
        data: {
          'sentry.origin': 'manual',
        },
        origin: 'manual',
      });
    });
  });

  describe('toContext and updateWithContext', () => {
    test('toContext should return correct context', () => {
      const originalContext = {
        traceId: 'a',
        spanId: 'b',
        sampled: false,
        description: 'test',
        op: 'op',
      };
      const span = new Span(originalContext);

      const newContext = span.toContext();

      expect(newContext).toStrictEqual({
        ...originalContext,
        spanId: expect.any(String),
        startTimestamp: expect.any(Number),
        tags: {},
        traceId: expect.any(String),
        data: {
          'sentry.op': 'op',
          'sentry.origin': 'manual',
        },
      });
    });

    test('updateWithContext should completely change span properties', () => {
      const originalContext = {
        traceId: 'a',
        spanId: 'b',
        sampled: false,
        description: 'test',
        op: 'op',
        tags: {
          tag0: 'hello',
        },
      };
      const span = new Span(originalContext);

      span.updateWithContext({
        traceId: 'c',
        spanId: 'd',
        sampled: true,
      });

      expect(span.spanContext().traceId).toBe('c');
      expect(span.spanContext().spanId).toBe('d');
      expect(span.sampled).toBe(true);
      expect(span.description).toBe(undefined);
      expect(span.op).toBe(undefined);
      expect(span.tags).toStrictEqual({});
    });

    test('using toContext and updateWithContext together should update only changed properties', () => {
      const originalContext = {
        traceId: 'a',
        spanId: 'b',
        sampled: false,
        description: 'test',
        op: 'op',
        tags: { tag0: 'hello' },
        data: { data0: 'foo' },
      };
      const span = new Span(originalContext);

      const newContext = {
        ...span.toContext(),
        description: 'new',
        endTimestamp: 1,
        op: 'new-op',
        sampled: true,
        tags: {
          tag1: 'bye',
        },
        data: {
          ...span.toContext().data,
        },
      };

      if (newContext.data) newContext.data.data1 = 'bar';

      span.updateWithContext(newContext);

      expect(span.spanContext().traceId).toBe('a');
      expect(span.spanContext().spanId).toBe('b');
      expect(span.description).toBe('new');
      expect(spanToJSON(span).timestamp).toBe(1);
      expect(span.op).toBe('new-op');
      expect(span.sampled).toBe(true);
      expect(span.tags).toStrictEqual({ tag1: 'bye' });
      expect(span.data).toStrictEqual({
        data0: 'foo',
        data1: 'bar',
        'sentry.op': 'op',
        'sentry.origin': 'manual',
      });
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
      span.setAttribute('str', {});

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
