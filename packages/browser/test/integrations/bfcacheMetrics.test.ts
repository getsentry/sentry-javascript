import { afterEach, describe, expect, it, vi } from 'vitest';
import { debug } from '@sentry/core/browser';
import { _collectNotRestoredReasons, _resolveMaxReasons } from '../../src/integrations/bfcacheMetrics';

describe('bfcacheMetricsIntegration', () => {
  describe('_resolveMaxReasons', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('reports every reason by default', () => {
      expect(_resolveMaxReasons(undefined)).toBe(Infinity);
    });

    it('keeps a valid configured cap', () => {
      expect(_resolveMaxReasons(3)).toBe(3);
      expect(_resolveMaxReasons(1)).toBe(1);
    });

    it('clamps values below 1 to 1 and warns', () => {
      const warnSpy = vi.spyOn(debug, 'warn').mockImplementation(() => {});

      expect(_resolveMaxReasons(0)).toBe(1);
      expect(_resolveMaxReasons(-5)).toBe(1);
      expect(warnSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('_collectNotRestoredReasons', () => {
    it('returns an empty list when there are no reasons', () => {
      expect(_collectNotRestoredReasons(undefined, 5)).toEqual([]);
      expect(_collectNotRestoredReasons(null, 5)).toEqual([]);
      expect(_collectNotRestoredReasons({ reasons: [], children: [] }, 5)).toEqual([]);
    });

    it('returns an empty list when maxReasons is zero or negative', () => {
      const tree = { reasons: [{ reason: 'unload-listener' }] };
      expect(_collectNotRestoredReasons(tree, 0)).toEqual([]);
      expect(_collectNotRestoredReasons(tree, -1)).toEqual([]);
    });

    it('collects top-frame reasons', () => {
      const tree = {
        reasons: [{ reason: 'unload-listener' }, { reason: 'response-cache-control-no-store' }],
      };

      expect(_collectNotRestoredReasons(tree, 5)).toEqual([
        { reason: 'unload-listener', frame: 'top' },
        { reason: 'response-cache-control-no-store', frame: 'top' },
      ]);
    });

    it('supports both string and object reason shapes', () => {
      const tree = {
        reasons: ['unload-listener', { reason: 'websocket' }],
      };

      expect(_collectNotRestoredReasons(tree, 5)).toEqual([
        { reason: 'unload-listener', frame: 'top' },
        { reason: 'websocket', frame: 'top' },
      ]);
    });

    it('skips empty/invalid reason entries', () => {
      const tree = {
        reasons: [{ reason: '' }, {}, { reason: 'unload-listener' }],
      };

      expect(_collectNotRestoredReasons(tree, 5)).toEqual([{ reason: 'unload-listener', frame: 'top' }]);
    });

    it('marks reasons from child frames as "child"', () => {
      const tree = {
        reasons: [{ reason: 'unload-listener' }],
        children: [{ reasons: [{ reason: 'websocket' }] }],
      };

      expect(_collectNotRestoredReasons(tree, 5)).toEqual([
        { reason: 'unload-listener', frame: 'top' },
        { reason: 'websocket', frame: 'child' },
      ]);
    });

    it('recurses into deeply nested child frames', () => {
      const tree = {
        reasons: [],
        children: [
          {
            reasons: [],
            children: [{ reasons: [{ reason: 'fetch' }] }],
          },
        ],
      };

      expect(_collectNotRestoredReasons(tree, 5)).toEqual([{ reason: 'fetch', frame: 'child' }]);
    });

    it('frames every reason by its position, without special-casing the reason value', () => {
      const tree = {
        reasons: [{ reason: 'masked' }],
        children: [{ reasons: [{ reason: 'masked' }] }],
      };

      expect(_collectNotRestoredReasons(tree, 5)).toEqual([
        { reason: 'masked', frame: 'top' },
        { reason: 'masked', frame: 'child' },
      ]);
    });

    it('caps the number of collected reasons at maxReasons', () => {
      const tree = {
        reasons: [{ reason: 'a' }, { reason: 'b' }, { reason: 'c' }],
        children: [{ reasons: [{ reason: 'd' }, { reason: 'e' }] }],
      };

      const collected = _collectNotRestoredReasons(tree, 2);
      expect(collected).toHaveLength(2);
      expect(collected).toEqual([
        { reason: 'a', frame: 'top' },
        { reason: 'b', frame: 'top' },
      ]);
    });

    it('stops recursing into children once the cap is reached', () => {
      const tree = {
        reasons: [{ reason: 'a' }, { reason: 'b' }],
        children: [{ reasons: [{ reason: 'c' }] }],
      };

      expect(_collectNotRestoredReasons(tree, 2)).toEqual([
        { reason: 'a', frame: 'top' },
        { reason: 'b', frame: 'top' },
      ]);
    });

    it('collects every reason when maxReasons is Infinity', () => {
      const tree = {
        reasons: [{ reason: 'a' }, { reason: 'b' }, { reason: 'c' }],
        children: [{ reasons: [{ reason: 'd' }, { reason: 'e' }] }],
      };

      expect(_collectNotRestoredReasons(tree, Infinity)).toEqual([
        { reason: 'a', frame: 'top' },
        { reason: 'b', frame: 'top' },
        { reason: 'c', frame: 'top' },
        { reason: 'd', frame: 'child' },
        { reason: 'e', frame: 'child' },
      ]);
    });
  });
});
