import { TRACEPARENT_REGEXP, timestampInSeconds } from '@sentry/utils';
import { Span } from '../../../src/tracing/span';
import { Transaction } from '../../../src/tracing/transaction';
import {
  spanGetMetadata,
  spanSetMetadata,
  spanTimeInputToSeconds,
  spanToTraceHeader,
} from '../../../src/utils/spanUtils';

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

describe('span metadata', () => {
  it('allows to get empty metadata', () => {
    const span = new Span();
    expect(spanGetMetadata(span)).toEqual({});
  });

  it('allows to set & get metadata', () => {
    const span = new Span();
    expect(spanGetMetadata(span)).toEqual({});

    spanSetMetadata(span, { one: 'one', two: 2 });
    expect(spanGetMetadata(span)).toEqual({ one: 'one', two: 2 });

    // partially overwrite
    spanSetMetadata(span, { one: 'two' });
    expect(spanGetMetadata(span)).toEqual({ one: 'two', two: 2 });
  });

  it('interacts with transaction.metadata correctly', () => {
    const transaction = new Transaction({ name: 'test' });
    expect(spanGetMetadata(transaction)).toEqual({
      source: 'custom',
      spanMetadata: {},
    });
    // eslint-disable-next-line deprecation/deprecation
    expect(transaction.metadata).toEqual({
      source: 'custom',
      spanMetadata: {},
    });

    spanSetMetadata(transaction, { one: 'one', two: 2 });
    expect(spanGetMetadata(transaction)).toEqual({ source: 'custom', spanMetadata: {}, one: 'one', two: 2 });
    // eslint-disable-next-line deprecation/deprecation
    expect(transaction.metadata).toEqual({ source: 'custom', spanMetadata: {}, one: 'one', two: 2 });

    // eslint-disable-next-line deprecation/deprecation
    transaction.setMetadata({ one: 'two' });
    expect(spanGetMetadata(transaction)).toEqual({ source: 'custom', spanMetadata: {}, one: 'two', two: 2 });
    // eslint-disable-next-line deprecation/deprecation
    expect(transaction.metadata).toEqual({ source: 'custom', spanMetadata: {}, one: 'two', two: 2 });
  });
});
