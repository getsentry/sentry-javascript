
import { insertToFlagBuffer } from '../../src/utils/featureFlags';
import type { FeatureFlag } from '@sentry/types';

describe('flags', () => {
  describe('insertToFlagBuffer()', () => {
    it('maintains ordering and evicts the oldest entry', () => {
      const buffer: FeatureFlag[] = [];
      const maxSize = 3;
      insertToFlagBuffer(buffer, 'feat1', true, maxSize);
      insertToFlagBuffer(buffer, 'feat2', true, maxSize);
      insertToFlagBuffer(buffer, 'feat3', true, maxSize);
      insertToFlagBuffer(buffer, 'feat4', true, maxSize);

      expect(buffer).toEqual([
        { flag: 'feat2', result: true },
        { flag: 'feat3', result: true },
        { flag: 'feat4', result: true },
      ]);
    });

    it('does not duplicate same-name flags and updates order and values', () => {
      const buffer: FeatureFlag[] = [];
      const maxSize = 3;
      insertToFlagBuffer(buffer, 'feat1', true, maxSize);
      insertToFlagBuffer(buffer, 'feat2', true, maxSize);
      insertToFlagBuffer(buffer, 'feat3', true, maxSize);
      insertToFlagBuffer(buffer, 'feat3', false, maxSize);
      insertToFlagBuffer(buffer, 'feat1', false, maxSize);

      expect(buffer).toEqual([
        { flag: 'feat2', result: true },
        { flag: 'feat3', result: false },
        { flag: 'feat1', result: false },
      ]);
    });

    it('does not allocate unnecessary space', () => {
      const buffer: FeatureFlag[] = [];
      const maxSize = 1000;
      insertToFlagBuffer(buffer, 'feat1', true, maxSize);
      insertToFlagBuffer(buffer, 'feat2', true, maxSize);

      expect(buffer).toEqual([
        { flag: 'feat1', result: true },
        { flag: 'feat2', result: true },
      ]);
    });

    it('errors when maxSize is less than current buffer size', () => {
      const buffer: FeatureFlag[] = [
        { flag: 'feat1', result: true },
        { flag: 'feat2', result: true },
      ];

      expect(() => insertToFlagBuffer(buffer, 'feat1', true, 1)).toThrowError();
      expect(() => insertToFlagBuffer(buffer, 'feat1', true, -2)).toThrowError();
    });
  })
})
