import { describe, expect, it, vi } from 'vitest';
import { onRequest } from '../../../src/integration/middleware';

vi.mock('../../../src/server/meta', () => ({
  getTracingMetaTagValues: () => ({
    sentryTrace: '<meta name="sentry-trace" content="123">',
    baggage: '<meta name="baggage" content="abc">',
  }),
}));

describe('Integration middleware', () => {
  it('exports an onRequest middleware request handler', async () => {
    expect(typeof onRequest).toBe('function');

    const next = vi.fn().mockReturnValue(Promise.resolve(new Response(null, { status: 200, headers: new Headers() })));
    const ctx = {
      request: {
        method: 'GET',
        url: '/users/123/details',
        headers: new Headers(),
      },
      url: new URL('https://myDomain.io/users/123/details'),
      params: {
        id: '123',
      },
    };
    // @ts-expect-error - a partial ctx object is fine here
    const res = await onRequest(ctx, next);

    expect(res).toBeDefined();
  });
});
