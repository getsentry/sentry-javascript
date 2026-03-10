import { describe, expect, it } from 'vitest';
import { estimateSerializedSpanSizeInBytes } from '../../../../src/tracing/spans/estimateSize';
import type { SerializedStreamedSpan } from '../../../../src/types-hoist/span';

// Produces a realistic trace_id (32 hex chars) and span_id (16 hex chars)
const TRACE_ID = 'a1b2c3d4e5f607189a0b1c2d3e4f5060';
const SPAN_ID = 'a1b2c3d4e5f60718';

describe('estimateSerializedSpanSizeInBytes', () => {
  it('estimates a minimal span (no attributes, no links, no parent) within a reasonable range of JSON.stringify', () => {
    const span: SerializedStreamedSpan = {
      trace_id: TRACE_ID,
      span_id: SPAN_ID,
      name: 'GET /api/users',
      start_timestamp: 1740000000.123,
      end_timestamp: 1740000001.456,
      status: 'ok',
      is_segment: true,
    };

    const estimate = estimateSerializedSpanSizeInBytes(span);
    const actual = JSON.stringify(span).length;

    expect(estimate).toBe(184);
    expect(actual).toBe(196);

    expect(estimate).toBeLessThanOrEqual(actual * 1.2);
    expect(estimate).toBeGreaterThanOrEqual(actual * 0.8);
  });

  it('estimates a span with a parent_span_id within a reasonable range', () => {
    const span: SerializedStreamedSpan = {
      trace_id: TRACE_ID,
      span_id: SPAN_ID,
      parent_span_id: 'b2c3d4e5f6071890',
      name: 'db.query',
      start_timestamp: 1740000000.0,
      end_timestamp: 1740000000.05,
      status: 'ok',
      is_segment: false,
    };

    const estimate = estimateSerializedSpanSizeInBytes(span);
    const actual = JSON.stringify(span).length;

    expect(estimate).toBe(172);
    expect(actual).toBe(222);

    expect(estimate).toBeLessThanOrEqual(actual * 1.1);
    expect(estimate).toBeGreaterThanOrEqual(actual * 0.7);
  });

  it('estimates a span with string attributes within a reasonable range', () => {
    const span: SerializedStreamedSpan = {
      trace_id: TRACE_ID,
      span_id: SPAN_ID,
      name: 'GET /api/users',
      start_timestamp: 1740000000.0,
      end_timestamp: 1740000000.1,
      status: 'ok',
      is_segment: false,
      attributes: {
        'http.method': { type: 'string', value: 'GET' },
        'http.url': { type: 'string', value: 'https://example.com/api/users?page=1&limit=100' },
        'http.status_code': { type: 'integer', value: 200 },
        'db.statement': { type: 'string', value: 'SELECT * FROM users WHERE id = $1' },
        'sentry.origin': { type: 'string', value: 'auto.http.fetch' },
      },
    };

    const estimate = estimateSerializedSpanSizeInBytes(span);
    const actual = JSON.stringify(span).length;

    expect(estimate).toBeLessThanOrEqual(actual * 1.2);
    expect(estimate).toBeGreaterThanOrEqual(actual * 0.8);
  });

  it('estimates a span with numeric attributes within a reasonable range', () => {
    const span: SerializedStreamedSpan = {
      trace_id: TRACE_ID,
      span_id: SPAN_ID,
      name: 'process.task',
      start_timestamp: 1740000000.0,
      end_timestamp: 1740000005.0,
      status: 'ok',
      is_segment: false,
      attributes: {
        'items.count': { type: 'integer', value: 42 },
        'duration.ms': { type: 'double', value: 5000.5 },
        'retry.count': { type: 'integer', value: 3 },
      },
    };

    const estimate = estimateSerializedSpanSizeInBytes(span);
    const actual = JSON.stringify(span).length;

    expect(estimate).toBeLessThanOrEqual(actual * 1.2);
    expect(estimate).toBeGreaterThanOrEqual(actual * 0.8);
  });

  it('estimates a span with boolean attributes within a reasonable range', () => {
    const span: SerializedStreamedSpan = {
      trace_id: TRACE_ID,
      span_id: SPAN_ID,
      name: 'cache.get',
      start_timestamp: 1740000000.0,
      end_timestamp: 1740000000.002,
      status: 'ok',
      is_segment: false,
      attributes: {
        'cache.hit': { type: 'boolean', value: true },
        'cache.miss': { type: 'boolean', value: false },
      },
    };

    const estimate = estimateSerializedSpanSizeInBytes(span);
    const actual = JSON.stringify(span).length;

    expect(estimate).toBeLessThanOrEqual(actual * 1.2);
    expect(estimate).toBeGreaterThanOrEqual(actual * 0.8);
  });

  it('estimates a span with array attributes within a reasonable range', () => {
    const span: SerializedStreamedSpan = {
      trace_id: TRACE_ID,
      span_id: SPAN_ID,
      name: 'batch.process',
      start_timestamp: 1740000000.0,
      end_timestamp: 1740000002.0,
      status: 'ok',
      is_segment: false,
      attributes: {
        'item.ids': { type: 'string[]', value: ['id-001', 'id-002', 'id-003', 'id-004', 'id-005'] },
        scores: { type: 'double[]', value: [1.1, 2.2, 3.3, 4.4] },
        flags: { type: 'boolean[]', value: [true, false, true] },
      },
    };

    const estimate = estimateSerializedSpanSizeInBytes(span);
    const actual = JSON.stringify(span).length;

    expect(estimate).toBeLessThanOrEqual(actual * 1.2);
    expect(estimate).toBeGreaterThanOrEqual(actual * 0.8);
  });

  it('estimates a span with links within a reasonable range', () => {
    const span: SerializedStreamedSpan = {
      trace_id: TRACE_ID,
      span_id: SPAN_ID,
      name: 'linked.operation',
      start_timestamp: 1740000000.0,
      end_timestamp: 1740000001.0,
      status: 'ok',
      is_segment: true,
      links: [
        {
          trace_id: 'b2c3d4e5f607189a0b1c2d3e4f506070',
          span_id: 'c3d4e5f607189a0b',
          sampled: true,
          attributes: {
            'sentry.link.type': { type: 'string', value: 'previous_trace' },
          },
        },
        {
          trace_id: 'c3d4e5f607189a0b1c2d3e4f50607080',
          span_id: 'd4e5f607189a0b1c',
        },
      ],
    };

    const estimate = estimateSerializedSpanSizeInBytes(span);
    const actual = JSON.stringify(span).length;

    expect(estimate).toBeLessThanOrEqual(actual * 1.2);
    expect(estimate).toBeGreaterThanOrEqual(actual * 0.8);
  });
});
