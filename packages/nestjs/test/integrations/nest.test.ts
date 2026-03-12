import { describe, expect, it } from 'vitest';
import { isPatched } from '../../src/integrations/helpers';
import type { InjectableTarget } from '../../src/integrations/types';

describe('Nest', () => {
  describe('isPatched', () => {
    it('should return true if target is already patched', () => {
      const target = { name: 'TestTarget', sentryPatched: true, prototype: {} };
      expect(isPatched(target)).toBe(true);
    });

    it('should add the sentryPatched property and return false if target is not patched', () => {
      const target: InjectableTarget = { name: 'TestTarget', prototype: {} };
      expect(isPatched(target)).toBe(false);
      expect(target.sentryPatched).toBe(true);
    });
  });
});
