import { describe, expect, it } from 'vitest';
import type { ExpressRequest } from '../../../../src/integrations/express/types';
import { getStoredLayers, storeLayer } from '../../../../src/integrations/express/request-layer-store';

describe('storeLayer', () => {
  it('handles case when nothing stored yet', () => {
    const req = {} as unknown as ExpressRequest;
    const empty = getStoredLayers(req);
    expect(empty).toStrictEqual([]);
    expect(getStoredLayers(req)).toStrictEqual([]);
  });
  it('stores layer for a request', () => {
    const req = {} as unknown as ExpressRequest;
    storeLayer(req, 'a');
    storeLayer(req, 'b');
    expect(getStoredLayers(req)).toStrictEqual(['a', 'b']);
  });
});
