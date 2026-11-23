import { describe, expect, it } from 'vitest';
import { createInteractionCache } from '../../src/web-vitals/interactionCache';

interface Item {
  id: number;
  latency: number;
}

function createCache() {
  return createInteractionCache<Item, Item>({
    match: (item, entry) => item.id === entry.id,
    merge: (item, entry) => {
      item.latency = Math.max(item.latency, entry.latency);
    },
    latency: item => item.latency,
  });
}

function add(cache: ReturnType<typeof createCache>, id: number, latency: number): void {
  cache.add({ id, latency }, () => ({ id, latency }));
}

describe('createInteractionCache', () => {
  it('merges an entry into the item it matches', () => {
    const cache = createCache();
    add(cache, 1, 50);
    add(cache, 1, 200);

    expect(cache.get({ id: 1, latency: 0 })).toEqual({ id: 1, latency: 200 });
  });

  it('keeps the 10 longest and the 10 most recent items once it is full', () => {
    const cache = createCache();
    const latencies = [
      900, 50, 800, 60, 700, 70, 600, 80, 500, 90, 400, 100, 300, 110, 200, 120, 150, 130, 140, 145, 10,
    ];
    latencies.forEach((latency, id) => add(cache, id, latency));

    const kept = latencies.map((_, id) => id).filter(id => cache.get({ id, latency: 0 }));

    // The 10 longest are ids 0-16 (even) and 19, the 10 most recent are ids 11-20.
    expect(kept).toEqual([0, 2, 4, 6, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });
});
