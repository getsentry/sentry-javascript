import { getGlobalObject } from '../src/global';

describe('getGlobalObject()', () => {
  test('should return the same object', () => {
    const backup = global.process;
    delete global.process;
    const first = getGlobalObject();
    const second = getGlobalObject();
    expect(first).toEqual(second);
    global.process = backup;
  });
});
