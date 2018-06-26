import { truncate } from '../string';

describe('truncate()', () => {
  test('it works as expected', () => {
    expect(truncate('lolol', 3)).toEqual('lol\u2026');
    expect(truncate('lolol', 10)).toEqual('lolol');
    expect(truncate('lol', 3)).toEqual('lol');
    expect(truncate(new Array(1000).join('f'), 0)).toEqual(
      new Array(1000).join('f'),
    );
  });
});
