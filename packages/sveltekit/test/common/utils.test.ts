import { describe, expect, it } from 'vitest';
import { isHttpError, isRedirect } from '../../src/common/utils';

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
