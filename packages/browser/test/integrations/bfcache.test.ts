import { describe, expect, it } from 'vitest';
import { _collectNotRestoredReasons } from '../../src/integrations/bfcache';

describe('bfcacheMetricsIntegration', () => {
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

    it('marks the "masked" reason as a masked frame regardless of depth', () => {
      const tree = {
        reasons: [{ reason: 'masked' }],
        children: [{ reasons: [{ reason: 'masked' }] }],
      };

      expect(_collectNotRestoredReasons(tree, 5)).toEqual([
        { reason: 'masked', frame: 'masked' },
        { reason: 'masked', frame: 'masked' },
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
  });
});
