import { convertTransactionEventToSpanJson } from '../../../src/utils/eventUtils';
import { SEMANTIC_ATTRIBUTE_PROFILE_ID, SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME } from '../../../src/semanticAttributes';
import type { Event } from '../../../src/types-hoist';
import {} from '../../../src/types-hoist';

describe('convertTransactionEventToSpanJson', () => {
  it('should return undefined for non-transaction events', () => {
    const event: Event = {
      type: undefined,
    };

    expect(convertTransactionEventToSpanJson(event)).toBeUndefined();
  });

  it('should convert a minimal transaction event to span JSON', () => {
    const event: Event = {
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
      description: undefined,
      op: undefined,
      parent_span_id: '',
      span_id: 'span456',
      start_timestamp: 0,
      status: undefined,
      timestamp: 1234567890,
      trace_id: 'abc123',
      origin: undefined,
      profile_id: undefined,
      exclusive_time: undefined,
      measurements: undefined,
    });
  });

  it('should convert a full transaction event to span JSON', () => {
    const event: Event = {
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
    });
  });

  it('should handle missing contexts.trace', () => {
    const event: Event = {
      type: 'transaction',
      timestamp: 1234567890,
      contexts: {},
    };

    expect(convertTransactionEventToSpanJson(event)).toEqual({
      data: {},
      description: undefined,
      op: undefined,
      parent_span_id: '',
      span_id: '',
      start_timestamp: 0,
      status: undefined,
      timestamp: 1234567890,
      trace_id: '',
      origin: undefined,
      profile_id: undefined,
      exclusive_time: undefined,
      measurements: undefined,
    });
  });
});
