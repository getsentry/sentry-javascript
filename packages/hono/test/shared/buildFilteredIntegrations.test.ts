import type { Integration } from '@sentry/core';
import { describe, expect, it, vi } from 'vitest';
import { buildFilteredIntegrations } from '../../src/shared/buildFilteredIntegrations';

const hono = { name: 'Hono' } as Integration;
const other = { name: 'Other' } as Integration;
const dflt = { name: 'Default' } as Integration;

function names(integrations: Integration[]): string[] {
  return integrations.map(i => i.name);
}

describe('buildFilteredIntegrations', () => {
  it.each([
    { label: 'array', input: [] as Integration[], filterUser: false },
    { label: 'function', input: () => [] as Integration[], filterUser: false },
    { label: 'undefined', input: undefined, filterUser: false },
    { label: 'array', input: [] as Integration[], filterUser: true },
    { label: 'function', input: () => [] as Integration[], filterUser: true },
    { label: 'undefined', input: undefined, filterUser: true },
  ])('returns a function when userIntegrations=$label, filterUserIntegrations=$filterUser', ({ input, filterUser }) => {
    expect(typeof buildFilteredIntegrations(input, filterUser)).toBe('function');
  });

  it.each([false, true])(
    'removes Hono from defaults when userIntegrations is undefined (filterUserIntegrations=%j)',
    filterUser => {
      const fn = buildFilteredIntegrations(undefined, filterUser);
      expect(fn([hono, other])).toEqual([other]);
    },
  );

  it.each([false, true])(
    'deduplicates when user integrations overlap with defaults (filterUserIntegrations=%j)',
    filterUser => {
      const duplicate = { name: 'Other' } as Integration;
      const fn = buildFilteredIntegrations([duplicate], filterUser);
      const result = fn([hono, other]);
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('Other');
    },
  );

  describe('filterUserIntegrations: false (Node / Bun)', () => {
    describe('when userIntegrations is an array', () => {
      it.each([
        {
          scenario: 'removes Hono from defaults',
          user: [other],
          defaults: [hono, dflt],
          includes: ['Other', 'Default'],
          excludes: ['Hono'],
        },
        {
          scenario: 'preserves user-provided Hono',
          user: [hono, other],
          defaults: [],
          includes: ['Hono', 'Other'],
          excludes: [],
        },
      ])('$scenario', ({ user, defaults, includes, excludes }) => {
        const fn = buildFilteredIntegrations(user, false);
        const result = names(fn(defaults));
        for (const name of includes) {
          expect(result).toContain(name);
        }
        for (const name of excludes) {
          expect(result).not.toContain(name);
        }
      });

      it('preserves user-provided Hono even when defaults also include it', () => {
        const fn = buildFilteredIntegrations([hono], false);
        const result = fn([hono, other]);
        expect(result.filter(i => i.name === 'Hono')).toHaveLength(1);
      });
    });

    describe('when userIntegrations is a function', () => {
      it('filters Hono from defaults before passing to the user function', () => {
        const userFn = vi.fn((_defaults: Integration[]) => [other]);
        const fn = buildFilteredIntegrations(userFn, false);
        fn([hono, dflt]);

        expect(userFn).toHaveBeenCalledWith([dflt]);
      });

      it('preserves Hono when explicitly returned by the user function', () => {
        const fn = buildFilteredIntegrations(() => [hono, other], false);
        expect(names(fn([]))).toEqual(['Hono', 'Other']);
      });

      it('excludes Hono when user function passes defaults through', () => {
        const fn = buildFilteredIntegrations(defaults => defaults, false);
        expect(names(fn([hono, other]))).toEqual(['Other']);
      });
    });
  });

  describe('filterUserIntegrations: true (Cloudflare)', () => {
    describe('when userIntegrations is an array', () => {
      it.each([
        {
          scenario: 'removes Hono from both user array and defaults',
          user: [hono, other],
          defaults: [hono, dflt],
          includes: ['Other', 'Default'],
          excludes: ['Hono'],
        },
        {
          scenario: 'returns empty when only Hono is provided',
          user: [hono],
          defaults: [],
          includes: [],
          excludes: ['Hono'],
        },
        { scenario: 'keeps non-Hono integrations', user: [other], defaults: [], includes: ['Other'], excludes: [] },
      ])('$scenario', ({ user, defaults, includes, excludes }) => {
        const fn = buildFilteredIntegrations(user, true);
        const result = names(fn(defaults));
        for (const name of includes) {
          expect(result).toContain(name);
        }
        for (const name of excludes) {
          expect(result).not.toContain(name);
        }
      });
    });

    describe('when userIntegrations is a function', () => {
      it('passes defaults through to the user function unfiltered', () => {
        const userFn = vi.fn((_defaults: Integration[]) => [other]);
        const defaults = [dflt];
        const fn = buildFilteredIntegrations(userFn, true);
        fn(defaults);

        expect(userFn).toHaveBeenCalledWith(defaults);
      });

      it.each([
        { scenario: 'filters Hono from result', userFn: () => [hono, other], expected: [other] },
        { scenario: 'returns empty when user function only returns Hono', userFn: () => [hono], expected: [] },
      ])('$scenario', ({ userFn, expected }) => {
        const fn = buildFilteredIntegrations(userFn, true);
        expect(fn([])).toEqual(expected);
      });
    });
  });
});
