import { describe, expect, it } from 'vitest';
import { getMiddlewareSpanOptions } from '../../src/server/utils';

describe('getMiddlewareSpanOptions', () => {
  it('returns correct span options', () => {
    const options = getMiddlewareSpanOptions('testMiddleware');
    expect(options).toEqual({
      op: 'middleware.tanstackstart',
      name: 'testMiddleware',
      attributes: {
        'sentry.op': 'middleware.tanstackstart',
        'sentry.origin': 'auto.middleware.tanstackstart',
      },
    });
  });
});
