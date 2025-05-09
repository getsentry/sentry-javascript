import { describe, expect, it } from 'vitest';
import { SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME, SEMANTIC_ATTRIBUTE_PROFILE_ID } from '../../../src/semanticAttributes';
import type { TransactionEvent } from '../../../src/types-hoist/event';
import type { SpanJSON } from '../../../src/types-hoist/span';
import {
  convertSpanJsonToTransactionEvent,
  convertTransactionEventToSpanJson,
} from '../../../src/utils/transactionEvent';

describe('convertTransactionEventToSpanJson', () => {
  it('should convert a minimal transaction event to span JSON', () => {
    const event: TransactionEvent = {
      type: 'transaction',
      contexts: {
        trace: {
          trace_id: 'abc123',
          span_id: 'span456',
        },
      },
      timestamp: 1234567890,
    };

    expect(convertTransactionEventToSpanJson(event)).toEqual({
      data: {},
      span_id: 'span456',
      start_timestamp: 0,
      timestamp: 1234567890,
      trace_id: 'abc123',
      is_segment: true,
    });
  });

  it('should convert a full transaction event to span JSON', () => {
    const event: TransactionEvent = {
      type: 'transaction',
      transaction: 'Test Transaction',
      contexts: {
        trace: {
          trace_id: 'abc123',
          parent_span_id: 'parent789',
          span_id: 'span456',
          status: 'ok',
          origin: 'manual',
          op: 'http',
          data: {
            [SEMANTIC_ATTRIBUTE_PROFILE_ID]: 'profile123',
            [SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME]: 123.45,
            other: 'value',
          },
        },
      },
      start_timestamp: 1234567800,
      timestamp: 1234567890,
      measurements: {
        fp: { value: 123, unit: 'millisecond' },
      },
    };

    expect(convertTransactionEventToSpanJson(event)).toEqual({
      data: {
        [SEMANTIC_ATTRIBUTE_PROFILE_ID]: 'profile123',
        [SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME]: 123.45,
        other: 'value',
      },
      description: 'Test Transaction',
      op: 'http',
      parent_span_id: 'parent789',
      span_id: 'span456',
      start_timestamp: 1234567800,
      status: 'ok',
      timestamp: 1234567890,
      trace_id: 'abc123',
      origin: 'manual',
      profile_id: 'profile123',
      exclusive_time: 123.45,
      measurements: {
        fp: { value: 123, unit: 'millisecond' },
      },
      is_segment: true,
    });
  });

  it('should handle missing contexts.trace', () => {
    const event: TransactionEvent = {
      type: 'transaction',
      contexts: {},
    };

    expect(convertTransactionEventToSpanJson(event)).toEqual({
      data: {},
      span_id: '',
      start_timestamp: 0,
      trace_id: '',
      is_segment: true,
    });
  });
});

describe('convertSpanJsonToTransactionEvent', () => {
  it('should convert a minimal span JSON to transaction event', () => {
    const span: SpanJSON = {
      data: {},
      parent_span_id: '',
      span_id: 'span456',
      start_timestamp: 0,
      timestamp: 1234567890,
      trace_id: 'abc123',
    };

    expect(convertSpanJsonToTransactionEvent(span)).toEqual({
      type: 'transaction',
      timestamp: 1234567890,
      start_timestamp: 0,
      contexts: {
        trace: {
          trace_id: 'abc123',
          span_id: 'span456',
          parent_span_id: '',
          data: {},
        },
      },
    });
  });

  it('should convert a full span JSON to transaction event', () => {
    const span: SpanJSON = {
      data: {
        other: 'value',
      },
      description: 'Test Transaction',
      op: 'http',
      parent_span_id: 'parent789',
      span_id: 'span456',
      start_timestamp: 1234567800,
      status: 'ok',
      timestamp: 1234567890,
      trace_id: 'abc123',
      origin: 'manual',
      profile_id: 'profile123',
      exclusive_time: 123.45,
      measurements: {
        fp: { value: 123, unit: 'millisecond' },
      },
    };

    expect(convertSpanJsonToTransactionEvent(span)).toEqual({
      type: 'transaction',
      timestamp: 1234567890,
      start_timestamp: 1234567800,
      transaction: 'Test Transaction',
      contexts: {
        trace: {
          trace_id: 'abc123',
          span_id: 'span456',
          parent_span_id: 'parent789',
          op: 'http',
          status: 'ok',
          origin: 'manual',
          data: {
            other: 'value',
            [SEMANTIC_ATTRIBUTE_PROFILE_ID]: 'profile123',
            [SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME]: 123.45,
          },
        },
      },
      measurements: {
        fp: { value: 123, unit: 'millisecond' },
      },
    });
  });
});
