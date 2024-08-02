import type { InjectableTarget } from '../../../src/integrations/tracing/nest/nest';
import { isPatched } from '../../../src/integrations/tracing/nest/nest';

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
