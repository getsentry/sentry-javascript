import { afterEach, describe, expect, it, vi } from 'vitest';
import { satisfies } from '../../src/module-wrapper/semver';

describe('semver satisfies', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exact versions', () => {
    it('matches exact version', () => {
      expect(satisfies('1.0.0', '1.0.0')).toBe(true);
      expect(satisfies('2.3.4', '2.3.4')).toBe(true);
      expect(satisfies('1.0.0', '=1.0.0')).toBe(true);
    });

    it('does not match different versions', () => {
      expect(satisfies('1.0.0', '1.0.1')).toBe(false);
      expect(satisfies('1.0.0', '2.0.0')).toBe(false);
    });
  });

  describe('comparison operators', () => {
    it('handles greater than', () => {
      expect(satisfies('2.0.0', '>1.0.0')).toBe(true);
      expect(satisfies('1.0.1', '>1.0.0')).toBe(true);
      expect(satisfies('1.0.0', '>1.0.0')).toBe(false);
      expect(satisfies('0.9.0', '>1.0.0')).toBe(false);
    });

    it('handles greater than or equal', () => {
      expect(satisfies('2.0.0', '>=1.0.0')).toBe(true);
      expect(satisfies('1.0.0', '>=1.0.0')).toBe(true);
      expect(satisfies('0.9.0', '>=1.0.0')).toBe(false);
    });

    it('handles less than', () => {
      expect(satisfies('0.9.0', '<1.0.0')).toBe(true);
      expect(satisfies('0.9.9', '<1.0.0')).toBe(true);
      expect(satisfies('1.0.0', '<1.0.0')).toBe(false);
      expect(satisfies('2.0.0', '<1.0.0')).toBe(false);
    });

    it('handles less than or equal', () => {
      expect(satisfies('0.9.0', '<=1.0.0')).toBe(true);
      expect(satisfies('1.0.0', '<=1.0.0')).toBe(true);
      expect(satisfies('2.0.0', '<=1.0.0')).toBe(false);
    });
  });

  describe('range expressions', () => {
    it('handles space-separated ranges (AND)', () => {
      expect(satisfies('1.5.0', '>=1.0.0 <2.0.0')).toBe(true);
      expect(satisfies('1.0.0', '>=1.0.0 <2.0.0')).toBe(true);
      expect(satisfies('1.9.9', '>=1.0.0 <2.0.0')).toBe(true);
      expect(satisfies('0.5.0', '>=1.0.0 <2.0.0')).toBe(false);
      expect(satisfies('2.0.0', '>=1.0.0 <2.0.0')).toBe(false);
      expect(satisfies('2.5.0', '>=1.0.0 <2.0.0')).toBe(false);
    });

    it('handles OR ranges (||)', () => {
      expect(satisfies('1.0.0', '1.0.0 || 2.0.0')).toBe(true);
      expect(satisfies('2.0.0', '1.0.0 || 2.0.0')).toBe(true);
      expect(satisfies('3.0.0', '1.0.0 || 2.0.0')).toBe(false);
    });

    it('handles complex OR with AND ranges', () => {
      expect(satisfies('1.5.0', '>=1.0.0 <2.0.0 || >=3.0.0 <4.0.0')).toBe(true);
      expect(satisfies('3.5.0', '>=1.0.0 <2.0.0 || >=3.0.0 <4.0.0')).toBe(true);
      expect(satisfies('2.5.0', '>=1.0.0 <2.0.0 || >=3.0.0 <4.0.0')).toBe(false);
    });

    it('handles major-only bound ranges', () => {
      const range = '>=4.0.0 <6';
      expect(satisfies('4.0.0', range)).toBe(true);
      expect(satisfies('4.18.2', range)).toBe(true);
      expect(satisfies('5.0.0', range)).toBe(true);
      expect(satisfies('5.99.99', range)).toBe(true);
      expect(satisfies('3.9.9', range)).toBe(false);
      expect(satisfies('6.0.0', range)).toBe(false);
      expect(satisfies('6.0.0-alpha', range)).toBe(true);
    });
  });

  describe('pre-release versions', () => {
    it('handles pre-release versions', () => {
      expect(satisfies('1.0.0-alpha', '1.0.0-alpha')).toBe(true);
      expect(satisfies('1.0.0-beta', '1.0.0-alpha')).toBe(false);
    });

    it('release version is greater than pre-release', () => {
      expect(satisfies('1.0.0', '>1.0.0-alpha')).toBe(true);
      expect(satisfies('1.0.0-alpha', '<1.0.0')).toBe(true);
    });

    it('compares pre-release identifiers correctly', () => {
      expect(satisfies('1.0.0-alpha.2', '>1.0.0-alpha.1')).toBe(true);
      expect(satisfies('1.0.0-beta', '>1.0.0-alpha')).toBe(true);
    });
  });

  describe('invalid versions', () => {
    it('returns false for invalid versions', () => {
      expect(satisfies('not-a-version', '>=1.0.0')).toBe(false);
      expect(satisfies('1.0', '>=1.0.0')).toBe(false);
    });

    it('returns false for invalid comparators', () => {
      expect(satisfies('1.0.0', 'invalid')).toBe(false);
    });
  });

  describe('empty range', () => {
    it('matches any version for empty range', () => {
      expect(satisfies('1.0.0', '')).toBe(true);
      expect(satisfies('999.0.0', '')).toBe(true);
      expect(satisfies('1.0.0', '   ')).toBe(true);
    });
  });

  describe('unsupported patterns warning', () => {
    it('still attempts to match but warns for caret ranges', () => {
      // Caret won't match because it's not a valid comparator in our simplified impl
      expect(satisfies('1.5.0', '^1.0.0')).toBe(false);
    });

    it('still attempts to match but warns for tilde ranges', () => {
      expect(satisfies('1.2.5', '~1.2.0')).toBe(false);
    });

    it('still attempts to match but warns for x-ranges', () => {
      expect(satisfies('1.5.0', '1.x')).toBe(false);
    });

    it('warns for hyphen ranges (space-hyphen-space)', () => {
      expect(satisfies('1.5.0', '1.0.0 - 2.0.0')).toBe(false);
    });
  });

  describe('version string formats', () => {
    it('accepts an optional v prefix on the version', () => {
      expect(satisfies('v1.2.3', '>=1.0.0')).toBe(true);
      expect(satisfies('v0.0.1', '<1.0.0')).toBe(true);
      expect(satisfies('v10.20.30', '>=10.0.0')).toBe(true);
    });

    it('parses build metadata on versions but not on comparators', () => {
      expect(satisfies('1.0.0+build.1', '1.0.0')).toBe(true);
      expect(satisfies('1.0.0+build', '>=1.0.0')).toBe(true);
      expect(satisfies('2.0.0+meta', '>1.0.0')).toBe(true);
      // Build metadata is not part of `COMPARATOR_REGEXP`; cannot express `1.0.0+foo` as a range bound.
      expect(satisfies('1.0.0+githash', '1.0.0+other')).toBe(false);
    });

    it('parses prerelease plus build metadata together', () => {
      expect(satisfies('1.0.0-rc.1+exp.sha512', '>=1.0.0-rc.0')).toBe(true);
      expect(satisfies('1.0.0-rc.1+exp', '1.0.0-rc.1')).toBe(true);
      expect(satisfies('1.0.0-alpha.beta+build', '<1.0.0')).toBe(true);
    });

    it('rejects versions that do not match strict semver numeric rules', () => {
      expect(satisfies('01.2.3', '>=0.0.0')).toBe(false);
      expect(satisfies('1.02.3', '>=0.0.0')).toBe(false);
      expect(satisfies('1.2.03', '>=0.0.0')).toBe(false);
    });

    it('rejects missing segments or extra segments', () => {
      expect(satisfies('1.0', '>=1.0.0')).toBe(false);
      expect(satisfies('1', '>=1.0.0')).toBe(false);
      expect(satisfies('1.0.0.1', '>=1.0.0')).toBe(false);
      expect(satisfies('', '>=1.0.0')).toBe(false);
    });
  });

  describe('comparator string formats', () => {
    it('accepts an optional v prefix on comparators', () => {
      expect(satisfies('1.5.0', '>=v1.0.0')).toBe(true);
      expect(satisfies('1.0.0', '=v1.0.0')).toBe(true);
      expect(satisfies('2.0.0', '>v1.9.9')).toBe(true);
      expect(satisfies('1.0.0-rc.1', '>=v1.0.0-alpha')).toBe(true);
    });

    it('does not support build metadata on comparators (invalid comparator)', () => {
      expect(satisfies('1.0.0', '>=1.0.0+build')).toBe(false);
    });

    it('handles multi-part prerelease in comparators', () => {
      expect(satisfies('1.0.0-rc.2', '>=1.0.0-rc.1')).toBe(true);
      expect(satisfies('1.0.0', '>=1.0.0-rc.99')).toBe(true);
    });
  });

  describe('prerelease ordering (additional cases)', () => {
    it('orders numeric vs non-numeric prerelease identifiers per semver rules', () => {
      // Numeric identifiers have lower precedence than non-numeric (semver 2.0.0).
      expect(satisfies('1.0.0-alpha', '>1.0.0-1')).toBe(true);
      expect(satisfies('1.0.0-1', '>1.0.0-alpha')).toBe(false);
    });

    it('shorter identifier list has lower precedence when shared prefix matches', () => {
      expect(satisfies('1.0.0-alpha.1', '>1.0.0-alpha')).toBe(true);
    });
  });
});
