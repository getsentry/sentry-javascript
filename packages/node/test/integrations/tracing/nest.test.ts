import { isPatched } from '../../../src/integrations/tracing/nest/helpers';
import type { InjectableTarget } from '../../../src/integrations/tracing/nest/types';

import { describe, expect, test } from 'vitest';

describe('Nest', () => {
  describe('isPatched', () => {
    test('should return true if target is already patched', () => {
      const target = { name: 'TestTarget', sentryPatched: true, prototype: {} };
      expect(isPatched(target)).toBe(true);
    });

    test('should add the sentryPatched property and return false if target is not patched', () => {
      const target: InjectableTarget = { name: 'TestTarget', prototype: {} };
      expect(isPatched(target)).toBe(false);
      expect(target.sentryPatched).toBe(true);
    });
  });
});
