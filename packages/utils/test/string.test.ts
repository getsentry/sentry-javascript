import { truncate } from '../src/string';

describe('truncate()', () => {
  test('it works as expected', () => {
    expect(truncate('lolol', 3)).toEqual('lol...');
    expect(truncate('lolol', 10)).toEqual('lolol');
    expect(truncate('1'.repeat(1000), 300)).toHaveLength(303);
    expect(truncate(new Array(1000).join('f'), 0)).toEqual(new Array(1000).join('f'));
    expect(truncate(new Array(1000).join('f'), 0)).toEqual(new Array(1000).join('f'));
  });

  test('it instantly returns input when non-string is passed', () => {
    // @ts-ignore
    expect(truncate(2)).toEqual(2);
    // @ts-ignore
    expect(truncate(undefined, 123)).toEqual(undefined);
    // @ts-ignore
    expect(truncate(null)).toEqual(null);
    const obj = {};
    // @ts-ignore
    expect(truncate(obj, '42')).toEqual(obj);
    const arr: any[] = [];
    // @ts-ignore
    expect(truncate(arr)).toEqual(arr);
  });
});
