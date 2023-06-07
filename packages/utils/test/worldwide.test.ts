import { GLOBAL_OBJ } from '../src/worldwide';

describe('GLOBAL_OBJ', () => {
  test('should return the same object', () => {
    const backup = global.process;
    // @ts-ignore for testing
    delete global.process;
    const first = GLOBAL_OBJ;
    const second = GLOBAL_OBJ;
    expect(first).toEqual(second);
    global.process = backup;
  });
});
