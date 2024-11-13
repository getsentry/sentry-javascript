
import { logger } from '@sentry/utils';
import { insertToFlagBuffer } from '../../src/utils/featureFlags';
import type { FeatureFlag } from '@sentry/types';
import { vi } from 'vitest';

describe('flags', () => {
  describe('insertToFlagBuffer()', () => {
    const loggerSpy = vi.spyOn(logger, 'error');

    afterEach(() => {
      loggerSpy.mockClear();
    });

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

    it('logs error and is a no-op when buffer is larger than maxSize', () => {
      const buffer: FeatureFlag[] = [
        { flag: 'feat1', result: true },
        { flag: 'feat2', result: true },
      ];

      insertToFlagBuffer(buffer, 'feat1', true, 1);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Feature Flags] insertToFlagBuffer called on a buffer larger than maxSize'),
      );
      expect(buffer).toEqual([
        { flag: 'feat1', result: true },
        { flag: 'feat2', result: true },
      ]);

      insertToFlagBuffer(buffer, 'feat1', true, -2);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Feature Flags] insertToFlagBuffer called on a buffer larger than maxSize'),
      );
      expect(buffer).toEqual([
        { flag: 'feat1', result: true },
        { flag: 'feat2', result: true },
      ]);
    });
  })
})
