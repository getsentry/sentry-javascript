import { describe, expect, it } from 'vitest';
import { isTargetPatched } from '../../src/integrations/helpers';
import type { InjectableTarget } from '../../src/integrations/types';

describe('Nest', () => {
  describe('isTargetPatched', () => {
    it('should return true if target is already patched', () => {
      const target = { name: 'TestTarget', sentryPatchedInjectable: true, prototype: {} };
      expect(isTargetPatched(target, 'sentryPatchedInjectable')).toBe(true);
    });

    it('should add the patch flag and return false if target is not patched', () => {
      const target: InjectableTarget = { name: 'TestTarget', prototype: {} };
      expect(isTargetPatched(target, 'sentryPatchedInjectable')).toBe(false);
      expect(target.sentryPatchedInjectable).toBe(true);
    });
  });
});
