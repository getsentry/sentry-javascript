import { describe, expect, it } from 'vitest';
import { envToBool, FALSY_ENV_VALUES, TRUTHY_ENV_VALUES } from '../../../src/utils/envToBool';

describe('envToBool', () => {
  describe('TRUTHY_ENV_VALUES', () => {
    it.each([...TRUTHY_ENV_VALUES])('returns true for "%s"', value => {
      expect(envToBool(value)).toBe(true);
      expect(envToBool(value, { strict: true })).toBe(true);
    });

    it('handles case insensitivity', () => {
      expect(envToBool('TRUE')).toBe(true);
      expect(envToBool('True')).toBe(true);
      expect(envToBool('YES')).toBe(true);
      expect(envToBool('Yes')).toBe(true);
    });
  });

  describe('FALSY_ENV_VALUES', () => {
    it.each([...FALSY_ENV_VALUES])('returns false for "%s"', value => {
      expect(envToBool(value)).toBe(false);
      expect(envToBool(value, { strict: true })).toBe(false);
    });

    it('handles case insensitivity', () => {
      expect(envToBool('FALSE')).toBe(false);
      expect(envToBool('False')).toBe(false);
      expect(envToBool('NO')).toBe(false);
      expect(envToBool('No')).toBe(false);
    });
  });

  describe('non-matching values', () => {
    it('returns null in strict mode for non-matching values', () => {
      expect(envToBool('http://localhost:8969', { strict: true })).toBe(null);
      expect(envToBool('random', { strict: true })).toBe(null);
      expect(envToBool('', { strict: true })).toBe(null);
    });

    it('returns Boolean(value) in loose mode for non-matching values', () => {
      expect(envToBool('http://localhost:8969')).toBe(true); // truthy string
      expect(envToBool('random')).toBe(true); // truthy string
      expect(envToBool('')).toBe(false); // falsy empty string
    });

    it('defaults to loose mode when options not provided', () => {
      expect(envToBool('http://localhost:8969')).toBe(true);
    });
  });
});
