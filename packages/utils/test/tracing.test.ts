import { tracingContextFromHeaders } from '../src/tracing';

describe('tracingContextFromHeaders()', () => {
  it('should produce a frozen baggage (empty object) when there is an incoming trace but no baggage header', () => {
    const tracingContext = tracingContextFromHeaders('12312012123120121231201212312012-1121201211212012-1', undefined);
    expect(tracingContext.dynamicSamplingContext).toEqual({});
    expect(tracingContext.propagationContext.dsc).toEqual({});
  });
});
