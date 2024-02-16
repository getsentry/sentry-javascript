import { SentrySpan, Transaction, getRootSpan } from '../../../src';

describe('getRootSpan', () => {
  it('returns the root span of a span (SentrySpan)', () => {
    const root = new SentrySpan({ name: 'test' });
    // @ts-expect-error this is highly illegal and shouldn't happen IRL
    // eslint-disable-next-line deprecation/deprecation
    root.transaction = root;

    // eslint-disable-next-line deprecation/deprecation
    const childSpan = root.startChild({ name: 'child' });
    expect(getRootSpan(childSpan)).toBe(root);
  });

  it('returns the root span of a span (Transaction)', () => {
    // eslint-disable-next-line deprecation/deprecation
    const root = new Transaction({ name: 'test' });

    // eslint-disable-next-line deprecation/deprecation
    const childSpan = root.startChild({ name: 'child' });
    expect(getRootSpan(childSpan)).toBe(root);
  });

  it('returns the span itself if it is a root span', () => {
    // eslint-disable-next-line deprecation/deprecation
    const span = new Transaction({ name: 'test' });

    expect(getRootSpan(span)).toBe(span);
  });

  it('returns undefined if span has no root span', () => {
    const span = new SentrySpan({ name: 'test' });

    expect(getRootSpan(span)).toBe(undefined);
  });
});
