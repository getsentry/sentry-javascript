import { describe, expect, test } from 'vitest';
import { GLOBAL_OBJ } from '../../../src/utils/worldwide';

describe('GLOBAL_OBJ', () => {
  test('should return the same object', () => {
    const backup = global.process;
    // @ts-expect-error for testing
    delete global.process;
    const first = GLOBAL_OBJ;
    const second = GLOBAL_OBJ;
    expect(first).toEqual(second);
    global.process = backup;
  });
});
