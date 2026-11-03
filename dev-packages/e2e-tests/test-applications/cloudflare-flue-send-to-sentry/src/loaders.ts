import DataLoader from 'dataloader';

/**
 * Built per call, not shared: a module-level loader caches its keys, so a second `count_items` would
 * skip the batch function and emit no span.
 *
 * Deliberately free of type annotations and generics. Flue's build scans every source file looking
 * for `'use agent'` modules and parses them as plain JavaScript, so a return type or a
 * `new DataLoader<number, number>(…)` fails the build with a parse error pointing at this file.
 */
export function createItemLoader() {
  return new DataLoader(async keys => keys.map(key => Number(key) * 2));
}
