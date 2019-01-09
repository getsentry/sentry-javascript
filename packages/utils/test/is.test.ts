import { isDOMError, isDOMException, isError, isErrorEvent, isPrimitive } from '../src/is';
import { supportsDOMError, supportsDOMException, supportsErrorEvent } from '../src/supports';

class SentryError extends Error {
  public name: string;

  public constructor(public message: string) {
    super(message);
    this.name = new.target.prototype.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

if (supportsDOMError()) {
  describe('isDOMError()', () => {
    test('should work as advertised', () => {
      expect(isDOMError(new Error())).toEqual(false);
      // See: src/supports.ts for details
      // @ts-ignore
      expect(isDOMError(new DOMError(''))).toEqual(true);
    });
  });
}

if (supportsDOMException()) {
  describe('isDOMException()', () => {
    test('should work as advertised', () => {
      expect(isDOMException(new Error())).toEqual(false);
      expect(isDOMException(new DOMException(''))).toEqual(true);
    });
  });
}

describe('isError()', () => {
  test('should work as advertised', () => {
    expect(isError(new Error())).toEqual(true);
    expect(isError(new ReferenceError())).toEqual(true);
    expect(isError(new SentryError('message'))).toEqual(true);
    expect(isError({})).toEqual(false);
    expect(
      isError({
        message: 'A fake error',
        stack: 'no stack here',
      }),
    ).toEqual(false);
    expect(isError('')).toEqual(false);
    expect(isError(true)).toEqual(false);
  });
});

if (supportsErrorEvent()) {
  describe('isErrorEvent()', () => {
    test('should work as advertised', () => {
      expect(isErrorEvent(new Error())).toEqual(false);
      expect(isErrorEvent(new ErrorEvent(''))).toEqual(true);
    });
  });
}

describe('isPrimitive()', () => {
  test('should work as advertised', () => {
    expect(isPrimitive(undefined)).toEqual(true);
    expect(isPrimitive(null)).toEqual(true);
    expect(isPrimitive(true)).toEqual(true);
    expect(isPrimitive('foo')).toEqual(true);
    expect(isPrimitive(42)).toEqual(true);

    expect(isPrimitive({})).toEqual(false);
    expect(isPrimitive([])).toEqual(false);
    expect(isPrimitive(new Error('foo'))).toEqual(false);
    expect(isPrimitive(new Date())).toEqual(false);
  });
});
