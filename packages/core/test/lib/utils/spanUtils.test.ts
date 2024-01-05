import { TRACEPARENT_REGEXP, timestampInSeconds } from '@sentry/utils';
import { Span, spanToTraceHeader } from '../../../src';
import { spanTimeInputToSeconds } from '../../../src/utils/spanUtils';

describe('spanToTraceHeader', () => {
  test('simple', () => {
    const span = new Span();
    expect(spanToTraceHeader(span)).toMatch(TRACEPARENT_REGEXP);
  });
  test('with sample', () => {
    const span = new Span({ sampled: true });
    expect(spanToTraceHeader(span)).toMatch(TRACEPARENT_REGEXP);
  });
});

describe('spanTimeInputToSeconds', () => {
  it('works with undefined', () => {
    const now = timestampInSeconds();
    expect(spanTimeInputToSeconds(undefined)).toBeGreaterThanOrEqual(now);
  });

  it('works with a timestamp in seconds', () => {
    const timestamp = timestampInSeconds();
    expect(spanTimeInputToSeconds(timestamp)).toEqual(timestamp);
  });

  it('works with a timestamp in milliseconds', () => {
    const timestamp = Date.now();
    expect(spanTimeInputToSeconds(timestamp)).toEqual(timestamp / 1000);
  });

  it('works with a Date object', () => {
    const timestamp = new Date();
    expect(spanTimeInputToSeconds(timestamp)).toEqual(timestamp.getTime() / 1000);
  });

  it('works with a simple array', () => {
    const seconds = Math.floor(timestampInSeconds());
    const timestamp: [number, number] = [seconds, 0];
    expect(spanTimeInputToSeconds(timestamp)).toEqual(seconds);
  });

  it('works with a array with nanoseconds', () => {
    const seconds = Math.floor(timestampInSeconds());
    const timestamp: [number, number] = [seconds, 9000];
    expect(spanTimeInputToSeconds(timestamp)).toEqual(seconds + 0.000009);
  });
});
