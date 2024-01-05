import { TRACEPARENT_REGEXP } from '@sentry/utils';
import { Span, spanToTraceHeader } from '../../../src';

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
