import { hasProp } from '../../../src/utils/hasProp';

describe('hasProp', () => {
  it('should return true if the object has the provided property', () => {
    const obj = { a: 1 };
    const result = hasProp(obj, 'a');
    expect(result).toBe(true);
  });

  it('should return false if the object does not have the provided property', () => {
    const obj = { a: 1 };
    const result = hasProp(obj, 'b');
    expect(result).toBe(false);
  });

  it('should return false if the object is null', () => {
    const obj = null;
    const result = hasProp(obj, 'a');
    expect(result).toBe(false);
  });

  it('should return false if the object is undefined', () => {
    const obj = undefined;
    const result = hasProp(obj, 'a');
    expect(result).toBe(false);
  });
});
