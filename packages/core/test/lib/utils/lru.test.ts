import { describe, expect, test } from 'vitest';
import { LRUMap } from '../../../src/utils/lru';

describe('LRUMap', () => {
  test('evicts older entries when reaching max size', () => {
    const map = new LRUMap<string, string>(3);
    map.set('a', '1');
    map.set('b', '2');
    map.set('c', '3');
    map.set('d', '4');
    map.set('e', '5');

    expect(map.keys()).toEqual(['c', 'd', 'e']);
  });

  test('updates last used when calling get', () => {
    const map = new LRUMap<string, string>(3);
    map.set('a', '1');
    map.set('b', '2');
    map.set('c', '3');

    map.get('a');

    map.set('d', '4');
    map.set('e', '5');

    expect(map.keys()).toEqual(['a', 'd', 'e']);
  });

  test('updates an existing entry without evicting another one', () => {
    const map = new LRUMap<string, string>(3);
    map.set('a', '1');
    map.set('b', '2');
    map.set('c', '3');

    map.set('b', '4');

    expect(map.keys()).toEqual(['a', 'c', 'b']);
    expect(map.get('b')).toEqual('4');
  });

  test('removes and returns entry', () => {
    const map = new LRUMap<string, string>(3);
    map.set('a', '1');
    map.set('b', '2');
    map.set('c', '3');
    map.set('d', '4');
    map.set('e', '5');

    expect(map.remove('c')).toEqual('3');

    expect(map.keys()).toEqual(['d', 'e']);
  });
});
