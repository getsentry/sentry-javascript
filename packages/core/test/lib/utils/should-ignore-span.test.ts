import { describe, expect, it, vi } from 'vitest';
import type { ClientOptions, SpanJSON } from '../../../src';
import { debug } from '../../../src/utils/debug-logger';
import { reparentChildSpans, shouldIgnoreSpan } from '../../../src/utils/should-ignore-span';

describe('shouldIgnoreSpan', () => {
  it('should not ignore spans with empty ignoreSpans', () => {
    const span = { description: 'test', op: 'test' };
    const ignoreSpans = [] as Required<ClientOptions>['ignoreSpans'];
    expect(shouldIgnoreSpan(span, ignoreSpans)).toBe(false);
  });

  describe('string patterns', () => {
    it.each([
      ['test', 'test', true],
      ['test', 'test2', false],
      ['test2', 'test', true],
    ])('should ignore spans with description %s & ignoreSpans=%s', (description, ignoreSpansPattern, expected) => {
      const span = { description, op: 'default' };
      const ignoreSpans = [ignoreSpansPattern];
      expect(shouldIgnoreSpan(span, ignoreSpans)).toBe(expected);
    });
  });

  describe('regex patterns', () => {
    it.each([
      ['test', /test/, true],
      ['test', /test2/, false],
      ['test2', /test/, true],
    ])('should ignore spans with description %s & ignoreSpans=%s', (description, ignoreSpansPattern, expected) => {
      const span = { description, op: 'default' };
      const ignoreSpans = [ignoreSpansPattern];
      expect(shouldIgnoreSpan(span, ignoreSpans)).toBe(expected);
    });
  });

  describe('complex patterns', () => {
    it.each([
      [{ name: 'test' }, true],
      [{ name: 'test2' }, false],
      [{ op: 'test' }, true],
      [{ op: 'test2' }, false],
      [{ name: 'test', op: 'test' }, true],
      [{ name: 'test2', op: 'test' }, false],
      [{ name: 'test', op: 'test2' }, false],
      [{ name: 'test2', op: 'test2' }, false],
      [{ name: 'test', op: 'test2' }, false],
    ])('should ignore spans with description %s & ignoreSpans=%s', (ignoreSpansPattern, expected) => {
      const span = { description: 'test span name', op: 'test span op' };
      const ignoreSpans = [ignoreSpansPattern];
      expect(shouldIgnoreSpan(span, ignoreSpans)).toBe(expected);
    });
  });

  it('works with multiple patterns', () => {
    const ignoreSpans = ['test', /test2/, { op: 'test2' }];

    // All of these are ignored because the name matches
    const span1 = { description: 'test span name', op: 'test span op' };
    const span2 = { description: 'test span name2', op: 'test span op2' };
    const span3 = { description: 'test span name3', op: 'test span op3' };
    const span4 = { description: 'test span name4', op: 'test span op4' };

    expect(shouldIgnoreSpan(span1, ignoreSpans)).toBe(true);
    expect(shouldIgnoreSpan(span2, ignoreSpans)).toBe(true);
    expect(shouldIgnoreSpan(span3, ignoreSpans)).toBe(true);
    expect(shouldIgnoreSpan(span4, ignoreSpans)).toBe(true);

    // All of these are ignored because the op matches
    const span5 = { description: 'custom 1', op: 'test2' };
    const span6 = { description: 'custom 2', op: 'test2' };
    const span7 = { description: 'custom 3', op: 'test2' };
    const span8 = { description: 'custom 4', op: 'test2' };

    expect(shouldIgnoreSpan(span5, ignoreSpans)).toBe(true);
    expect(shouldIgnoreSpan(span6, ignoreSpans)).toBe(true);
    expect(shouldIgnoreSpan(span7, ignoreSpans)).toBe(true);
    expect(shouldIgnoreSpan(span8, ignoreSpans)).toBe(true);

    // None of these are ignored because the name and op don't match
    const span9 = { description: 'custom 5', op: 'test' };
    const span10 = { description: 'custom 6', op: 'test' };
    const span11 = { description: 'custom 7', op: 'test' };
    const span12 = { description: 'custom 8', op: 'test' };

    expect(shouldIgnoreSpan(span9, ignoreSpans)).toBe(false);
    expect(shouldIgnoreSpan(span10, ignoreSpans)).toBe(false);
    expect(shouldIgnoreSpan(span11, ignoreSpans)).toBe(false);
    expect(shouldIgnoreSpan(span12, ignoreSpans)).toBe(false);
  });

  it('matches inferred HTTP span names', () => {
    expect(shouldIgnoreSpan({ description: 'GET /health', op: 'http.server' }, ['GET /health'])).toBe(true);
  });

  it('matches middleware span names with regex', () => {
    expect(
      shouldIgnoreSpan({ description: 'middleware - expressInit', op: 'middleware.express' }, [/middleware/]),
    ).toBe(true);
  });

  it('matches IgnoreSpanFilter with op only', () => {
    expect(shouldIgnoreSpan({ description: 'GET /health', op: 'http.server' }, [{ op: 'http.server' }])).toBe(true);
  });

  describe('attribute matching', () => {
    it.each([
      // strings: pattern matching (substring + regex)
      ['GET', 'GE', true],
      ['GET', 'POST', false],
      ['GET', /^GET$/, true],
      ['GET', /^POST$/, false],
      // numbers: strict equality
      [200, 200, true],
      [404, 200, false],
      // booleans: strict equality
      [true, true, true],
      [true, false, false],
      // no type coercion across primitive types
      [true, 'true', false],
      // arrays: element-wise strict equality (one positive per element type, plus mismatch shapes)
      [['a', 'b'], ['a', 'b'], true],
      [['a', 'b'], ['a', 'c'], false],
      [['a', 'b'], ['a'], false],
      [[1, 2], [1, 2], true],
      [[true, false], [true, false], true],
    ])('matches attribute value %j against pattern %j → %s', (actual, pattern, expected) => {
      const span = { description: 'span', op: 'op', attributes: { x: actual } };
      expect(shouldIgnoreSpan(span, [{ attributes: { x: pattern } }])).toBe(expected);
    });

    it('does not match when the attribute key is absent on the span', () => {
      const span = { description: 'span', op: 'op', attributes: {} };
      expect(shouldIgnoreSpan(span, [{ attributes: { 'missing.key': 'x' } }])).toBe(false);
    });

    it('requires every attribute entry to match', () => {
      const span = { description: 'span', op: 'op', attributes: { a: 1, b: 2 } };
      expect(shouldIgnoreSpan(span, [{ attributes: { a: 1, b: 2 } }])).toBe(true);
      expect(shouldIgnoreSpan(span, [{ attributes: { a: 1, b: 3 } }])).toBe(false);
    });

    it('requires both name and attributes to match', () => {
      const span = { description: 'GET /healthz', op: 'http.server', attributes: { 'http.method': 'GET' } };
      expect(shouldIgnoreSpan(span, [{ name: /healthz?/, attributes: { 'http.method': 'GET' } }])).toBe(true);
      expect(shouldIgnoreSpan(span, [{ name: /healthz?/, attributes: { 'http.method': 'POST' } }])).toBe(false);
      expect(shouldIgnoreSpan(span, [{ name: /other/, attributes: { 'http.method': 'GET' } }])).toBe(false);
    });

    it('still matches an attribute-only filter on a span without a description', () => {
      const span = { description: undefined as unknown as string, op: undefined, attributes: { foo: 'bar' } };
      expect(shouldIgnoreSpan(span, [{ attributes: { foo: 'bar' } }])).toBe(true);
    });
  });

  it('emits a debug log when a span is ignored', () => {
    const debugLogSpy = vi.spyOn(debug, 'log');
    const span = { description: 'testDescription', op: 'testOp' };
    const ignoreSpans = [/test/];
    expect(shouldIgnoreSpan(span, ignoreSpans)).toBe(true);
    expect(debugLogSpy).toHaveBeenCalledWith(
      'Ignoring span testOp - testDescription because it matches `ignoreSpans`.',
    );
  });
});

describe('reparentChildSpans', () => {
  it('should ignore dropped root spans', () => {
    const span1 = { span_id: '1' } as SpanJSON;
    const span2 = { span_id: '2', parent_span_id: '1' } as SpanJSON;
    const span3 = { span_id: '3', parent_span_id: '2' } as SpanJSON;

    const spans = [span1, span2, span3];

    reparentChildSpans(spans, span1);

    expect(spans).toEqual([span1, span2, span3]);
    expect(span1.parent_span_id).toBeUndefined();
    expect(span2.parent_span_id).toBe('1');
    expect(span3.parent_span_id).toBe('2');
  });

  it('should reparent child spans of the dropped span', () => {
    const span1 = { span_id: '1' } as SpanJSON;
    const span2 = { span_id: '2', parent_span_id: '1' } as SpanJSON;
    const span3 = { span_id: '3', parent_span_id: '2' } as SpanJSON;
    const span4 = { span_id: '4', parent_span_id: '3' } as SpanJSON;

    const spans = [span1, span2, span3, span4];

    reparentChildSpans(spans, span2);

    expect(spans).toEqual([span1, span2, span3, span4]);
    expect(span1.parent_span_id).toBeUndefined();
    expect(span2.parent_span_id).toBe('1');
    expect(span3.parent_span_id).toBe('1');
    expect(span4.parent_span_id).toBe('3');
  });
});
