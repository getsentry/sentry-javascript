import { SENTRY_BAGGAGE_HEADER, SENTRY_TRACE_HEADER } from '../src/constants';
import { SentryPropagator } from '../src/propagator';

describe('SentryPropagator', () => {
  const propogator = new SentryPropagator();

  it('returns fields set', () => {
    expect(propogator.fields()).toEqual([SENTRY_TRACE_HEADER, SENTRY_BAGGAGE_HEADER]);
  });
});
