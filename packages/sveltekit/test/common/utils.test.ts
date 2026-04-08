import { describe, expect, it, vi } from 'vitest';
import { getRouteId, isHttpError, isRedirect } from '../../src/common/utils';

describe('isRedirect', () => {
  it.each([
    { location: '/users/id', status: 300 },
    { location: '/users/id', status: 304 },
    { location: '/users/id', status: 308 },
    { location: '', status: 308 },
  ])('returns `true` for valid Redirect objects', redirectObject => {
    expect(isRedirect(redirectObject)).toBe(true);
  });

  it.each([
    300,
    'redirect',
    { location: { route: { id: 'users/id' } }, status: 300 },
    { status: 308 },
    { location: '/users/id' },
    { location: '/users/id', status: 201 },
    { location: '/users/id', status: 400 },
    { location: '/users/id', status: 500 },
  ])('returns `false` for invalid Redirect objects', redirectObject => {
    expect(isRedirect(redirectObject)).toBe(false);
  });
});

describe('isHttpError', () => {
  it.each([
    { status: 404, body: 'Not found' },
    { status: 500, body: 'Internal server error' },
  ])('returns `true` for valid HttpError objects (%s)', httpErrorObject => {
    expect(isHttpError(httpErrorObject)).toBe(true);
  });

  it.each([new Error(), { status: 301, message: '/users/id' }, 'string error', { status: 404 }, { body: 'Not found' }])(
    'returns `false` for other thrown objects (%s)',
    httpErrorObject => {
      expect(isHttpError(httpErrorObject)).toBe(false);
    },
  );
});

describe('getRouteId', () => {
  it('returns route.id when event has untrack (SvelteKit 2+)', () => {
    const untrack = vi.fn(<T>(fn: () => T) => fn());
    const event = {
      route: { id: '/blog/[slug]' },
      untrack,
    };

    // @ts-expect-error - only passing a partial load event here
    expect(getRouteId(event)).toBe('/blog/[slug]');

    expect(untrack).toHaveBeenCalledTimes(1);
    expect(untrack).toHaveBeenCalledWith(expect.any(Function));
  });

  it('returns undefined when event has untrack but route.id is null', () => {
    const untrack = vi.fn(<T>(fn: () => T) => fn());
    const event = {
      route: { id: null },
      untrack,
    };

    // @ts-expect-error - only passing a partial load event here
    expect(getRouteId(event)).toBeUndefined();

    expect(untrack).toHaveBeenCalledTimes(1);
    expect(untrack).toHaveBeenCalledWith(expect.any(Function));
  });

  it('falls back to getOwnPropertyDescriptor and avoids triggering the proxy', () => {
    const routeId = '/users/[id]';

    let routeIdAccessed = false;
    const route = { id: routeId };

    // taken from https://github.com/sveltejs/kit/blob/159aece0654db020f95bc414f6a21f25fbc5f22f/packages/kit/src/runtime/client/client.js#L783-L790
    const proxiedRoute = new Proxy(route, {
      get: (target, key) => {
        routeIdAccessed = true;
        // @ts-expect-error - this is fine for the test
        return target[key];
      },
    });

    const event = { route: proxiedRoute };
    // @ts-expect-error - only passing a partial load event here
    expect(getRouteId(event)).toBe(routeId);
    expect(routeIdAccessed).toBe(false);

    // sanity check that the proxying mechanism works
    expect(event.route.id).toBe(routeId);
    expect(routeIdAccessed).toBe(true);
  });

  it('returns undefined when event has no route', () => {
    // @ts-expect-error - only passing a partial load event here
    expect(getRouteId({})).toBeUndefined();
    // @ts-expect-error - only passing a partial load event here
    expect(getRouteId({ route: null })).toBeUndefined();
  });
});
