import type { ExpressRequest } from './types';

// map of patched request objects to stored layers
const requestLayerStore = new WeakMap<ExpressRequest, string[]>();
export const storeLayer = (req: ExpressRequest, layer: string) => {
  const store = requestLayerStore.get(req);
  if (!store) requestLayerStore.set(req, [layer]);
  else store.push(layer);
};

export const getStoredLayers = (req: ExpressRequest) => {
  const store = requestLayerStore.get(req);
  if (store) return store;
  else {
    const store: string[] = [];
    requestLayerStore.set(req, store);
    return store;
  }
};
