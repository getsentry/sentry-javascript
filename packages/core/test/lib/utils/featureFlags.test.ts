import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentScope } from '../../../src/currentScopes';
import { debug } from '../../../src/utils/debug-logger';
import {
  _INTERNAL_insertFlagToScope,
  _INTERNAL_insertToFlagBuffer,
  type FeatureFlag,
} from '../../../src/utils/featureFlags';

describe('flags', () => {
  describe('insertFlagToScope()', () => {
    it('adds flags to the current scope context', () => {
      const maxSize = 3;
      _INTERNAL_insertFlagToScope('feat1', true, maxSize);
      _INTERNAL_insertFlagToScope('feat2', true, maxSize);
      _INTERNAL_insertFlagToScope('feat3', true, maxSize);
      _INTERNAL_insertFlagToScope('feat4', true, maxSize);

      const scope = getCurrentScope();
      expect(scope.getScopeData().contexts.flags?.values).toEqual([
        { flag: 'feat2', result: true },
        { flag: 'feat3', result: true },
        { flag: 'feat4', result: true },
      ]);
    });
  });

  describe('insertToFlagBuffer()', () => {
    const loggerSpy = vi.spyOn(debug, 'error');

    afterEach(() => {
      loggerSpy.mockClear();
    });

    it('maintains ordering and evicts the oldest entry', () => {
      const buffer: FeatureFlag[] = [];
      const maxSize = 3;
      _INTERNAL_insertToFlagBuffer(buffer, 'feat1', true, maxSize);
      _INTERNAL_insertToFlagBuffer(buffer, 'feat2', true, maxSize);
      _INTERNAL_insertToFlagBuffer(buffer, 'feat3', true, maxSize);
      _INTERNAL_insertToFlagBuffer(buffer, 'feat4', true, maxSize);

      expect(buffer).toEqual([
        { flag: 'feat2', result: true },
        { flag: 'feat3', result: true },
        { flag: 'feat4', result: true },
      ]);
    });

    it('does not duplicate same-name flags and updates order and values', () => {
      const buffer: FeatureFlag[] = [];
      const maxSize = 3;
      _INTERNAL_insertToFlagBuffer(buffer, 'feat1', true, maxSize);
      _INTERNAL_insertToFlagBuffer(buffer, 'feat2', true, maxSize);
      _INTERNAL_insertToFlagBuffer(buffer, 'feat3', true, maxSize);
      _INTERNAL_insertToFlagBuffer(buffer, 'feat3', false, maxSize);
      _INTERNAL_insertToFlagBuffer(buffer, 'feat1', false, maxSize);

      expect(buffer).toEqual([
        { flag: 'feat2', result: true },
        { flag: 'feat3', result: false },
        { flag: 'feat1', result: false },
      ]);
    });

    it('does not allocate unnecessary space', () => {
      const buffer: FeatureFlag[] = [];
      const maxSize = 1000;
      _INTERNAL_insertToFlagBuffer(buffer, 'feat1', true, maxSize);
      _INTERNAL_insertToFlagBuffer(buffer, 'feat2', true, maxSize);

      expect(buffer).toEqual([
        { flag: 'feat1', result: true },
        { flag: 'feat2', result: true },
      ]);
    });

    it('does not accept non-boolean values', () => {
      const buffer: FeatureFlag[] = [];
      const maxSize = 1000;
      _INTERNAL_insertToFlagBuffer(buffer, 'feat1', 1, maxSize);
      _INTERNAL_insertToFlagBuffer(buffer, 'feat2', 'string', maxSize);

      expect(buffer).toEqual([]);
    });

    it('logs error and is a no-op when buffer is larger than maxSize', () => {
      const buffer: FeatureFlag[] = [
        { flag: 'feat1', result: true },
        { flag: 'feat2', result: true },
      ];

      _INTERNAL_insertToFlagBuffer(buffer, 'feat1', true, 1);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Feature Flags] insertToFlagBuffer called on a buffer larger than maxSize'),
      );
      expect(buffer).toEqual([
        { flag: 'feat1', result: true },
        { flag: 'feat2', result: true },
      ]);

      _INTERNAL_insertToFlagBuffer(buffer, 'feat1', true, -2);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Feature Flags] insertToFlagBuffer called on a buffer larger than maxSize'),
      );
      expect(buffer).toEqual([
        { flag: 'feat1', result: true },
        { flag: 'feat2', result: true },
      ]);
    });
  });
});
