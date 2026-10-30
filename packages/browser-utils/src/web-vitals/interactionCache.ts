const MAX_ITEMS_TO_KEEP = 10;

interface InteractionCacheOptions<T, E> {
  /**
   * Whether an entry belongs to an item that is already cached.
   */
  match: (item: T, entry: E) => boolean;
  /**
   * Folds another entry into the item it belongs to.
   */
  merge: (item: T, entry: E) => void;
  /**
   * How long the item took, which decides what is kept once the cache is full.
   */
  latency: (item: T) => number;
}

export interface InteractionCache<T, E> {
  /**
   * Merges the entry into the item it belongs to, or caches the item `create` returns.
   */
  add(entry: E, create: () => T): void;
  get(entry: E): T | undefined;
}

/**
 * Caches what event timing entries are grouped into, and keeps what an INP report can still need
 * the way web-vitals' attribution build does: the 10 most recent items, plus the 10 longest.
 */
export function createInteractionCache<T, E>({
  match,
  merge,
  latency,
}: InteractionCacheOptions<T, E>): InteractionCache<T, E> {
  let items: T[] = [];

  const get = (entry: E): T | undefined => {
    // The most likely match is the latest item.
    for (let i = items.length - 1; i >= 0; i--) {
      if (match(items[i]!, entry)) {
        return items[i];
      }
    }

    return undefined;
  };

  return {
    get,
    add(entry, create) {
      const item = get(entry);
      if (item) {
        merge(item, entry);

        return;
      }

      items.push(create());

      if (items.length > MAX_ITEMS_TO_KEEP * 2) {
        const longest = items
          .slice()
          .sort((a, b) => latency(b) - latency(a))
          .slice(0, MAX_ITEMS_TO_KEEP);
        items = items.filter((cached, i) => i >= items.length - MAX_ITEMS_TO_KEEP || longest.includes(cached));
      }
    },
  };
}
