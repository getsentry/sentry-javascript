import { describe, expect, it } from 'vitest';

import { formatRouteTiming, parseRouteTiming } from '../../src/v3/routeTiming';

describe('route timing entry', () => {
  it('round trips a route', () => {
    expect(parseRouteTiming(formatRouteTiming('/users/:id'))).toBe('/users/:id');
  });

  it('round trips a route with header-breaking characters', () => {
    const route = '/files/:name("a\\b")';

    expect(formatRouteTiming(route)).toBe('sentry-route;desc="/files/:name(\\"a\\\\b\\")"');
    expect(parseRouteTiming(formatRouteTiming(route))).toBe(route);
  });

  it('finds the entry among others', () => {
    expect(parseRouteTiming(`db;dur=5, ${formatRouteTiming('/')}, cache;desc="hit"`)).toBe('/');
  });

  it('is undefined without the entry', () => {
    expect(parseRouteTiming('db;dur=5')).toBeUndefined();
    expect(parseRouteTiming(null)).toBeUndefined();
  });
});
