import { GLOBAL_OBJ } from '../src/globalobject';

describe('GLOBAL_OBJ', () => {
  test('should return the same object', () => {
    const backup = global.process;
    delete global.process;
    const first = GLOBAL_OBJ;
    const second = GLOBAL_OBJ;
    expect(first).toEqual(second);
    global.process = backup;
  });
});
