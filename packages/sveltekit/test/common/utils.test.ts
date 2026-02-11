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
    expect(getRouteId(event)).toBeUndefined();
  });

  it('uses getOwnPropertyDescriptor when untrack is not present (SvelteKit 1.x)', () => {
    const event = {
      route: { id: '/users/[id]' },
    };
    expect(getRouteId(event)).toBe('/users/[id]');
  });

  it('uses getOwnPropertyDescriptor and avoids proxy when route has descriptor', () => {
    const routeId = '/users/[id]';
    const route = {};
    Object.defineProperty(route, 'id', { value: routeId, enumerable: true });
    const event = { route };
    expect(getRouteId(event)).toBe(routeId);
  });

  it('returns undefined when event has no route', () => {
    expect(getRouteId({})).toBeUndefined();
    expect(getRouteId({ route: null })).toBeUndefined();
  });
});
