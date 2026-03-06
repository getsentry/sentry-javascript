import { beforeEach, describe, expect, it } from 'vitest';
import { _INTERNAL_resetSequenceNumber, getSequenceAttribute } from '../../../src/utils/timestampSequence';

describe('getSequenceAttribute', () => {
  beforeEach(() => {
    _INTERNAL_resetSequenceNumber();
  });

  it('returns undefined for the first call (sequence 0)', () => {
    const attr = getSequenceAttribute(1000.001);
    expect(attr).toBeUndefined();
  });

  it('returns the correct attribute key and integer type for sequence > 0', () => {
    getSequenceAttribute(1000.001);
    const attr = getSequenceAttribute(1000.001);
    expect(attr).toBeDefined();
    expect(attr!.key).toBe('sentry.timestamp.sequence');
    expect(attr!.value.type).toBe('integer');
  });

  it('increments by 1 for each call within the same millisecond', () => {
    const first = getSequenceAttribute(1000.001);
    const second = getSequenceAttribute(1000.001);
    const third = getSequenceAttribute(1000.001);

    expect(first).toBeUndefined();
    expect(second!.value.value).toBe(1);
    expect(third!.value.value).toBe(2);
  });

  it('resets to 0 (undefined) when the integer millisecond changes', () => {
    // Same millisecond (1000001ms)
    expect(getSequenceAttribute(1000.001)).toBeUndefined();
    expect(getSequenceAttribute(1000.001)!.value.value).toBe(1);

    // Different millisecond (1000002ms) - resets
    expect(getSequenceAttribute(1000.002)).toBeUndefined();
    expect(getSequenceAttribute(1000.002)!.value.value).toBe(1);
  });

  it('does not reset when the fractional part changes but integer millisecond stays the same', () => {
    // 1000001.0ms and 1000001.9ms both floor to 1000001ms
    expect(getSequenceAttribute(1000.001)).toBeUndefined();
    expect(getSequenceAttribute(1000.0019)!.value.value).toBe(1);
  });

  it('resets via _INTERNAL_resetSequenceNumber', () => {
    expect(getSequenceAttribute(1000.001)).toBeUndefined();
    expect(getSequenceAttribute(1000.001)!.value.value).toBe(1);

    _INTERNAL_resetSequenceNumber();

    expect(getSequenceAttribute(1000.001)).toBeUndefined();
  });

  it('resets to 0 after _INTERNAL_resetSequenceNumber even with same timestamp', () => {
    getSequenceAttribute(1000.001);
    getSequenceAttribute(1000.001);

    _INTERNAL_resetSequenceNumber();

    // After reset, _previousTimestampMs is undefined, so it should start at 0 (undefined)
    const attr = getSequenceAttribute(1000.001);
    expect(attr).toBeUndefined();
  });

  it('shares sequence across interleaved calls (monotonically increasing within same ms)', () => {
    // Simulate interleaved log and metric captures at the same timestamp
    const logSeq = getSequenceAttribute(1000.001);
    const metricSeq = getSequenceAttribute(1000.001);
    const logSeq2 = getSequenceAttribute(1000.001);

    expect(logSeq).toBeUndefined();
    expect(metricSeq!.value.value).toBe(1);
    expect(logSeq2!.value.value).toBe(2);
  });
});
