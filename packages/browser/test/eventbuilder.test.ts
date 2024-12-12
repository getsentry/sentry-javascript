/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultStackParser } from '../src';
import { eventFromUnknownInput, extractMessage, extractType } from '../src/eventbuilder';

vi.mock('@sentry/core', async requireActual => {
  return {
    ...((await requireActual()) as any),
    getClient() {
      return {
        getOptions(): any {
          return { normalizeDepth: 6 };
        },
      };
    },
  };
});

class MyTestClass {
  prop1 = 'hello';
  prop2 = 2;
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('eventFromUnknownInput', () => {
  it('should use normalizeDepth from init options', () => {
    const deepObject = {
      a: {
        b: {
          c: {
            d: {
              e: {
                f: {
                  g: 'foo',
                },
              },
            },
          },
        },
      },
    };

    const event = eventFromUnknownInput(defaultStackParser, deepObject);

    expect(event.extra?.__serialized__).toEqual({
      a: {
        b: {
          c: {
            d: {
              e: {
                f: '[Object]',
              },
            },
          },
        },
      },
    });
  });

  it.each([
    ['empty object', {}, {}, 'Object captured as exception with keys: [object has no keys]'],
    [
      'pojo',
      { prop1: 'hello', prop2: 2 },
      { prop1: 'hello', prop2: 2 },
      'Object captured as exception with keys: prop1, prop2',
    ],
    [
      'Custom Class',
      new MyTestClass(),
      { prop1: 'hello', prop2: 2 },
      'Object captured as exception with keys: prop1, prop2',
    ],
    [
      'Event',
      new Event('custom'),
      {
        currentTarget: '[object Null]',
        isTrusted: false,
        target: '[object Null]',
        type: 'custom',
      },
      'Event `Event` (type=custom) captured as exception',
    ],
    [
      'MouseEvent',
      new MouseEvent('click'),
      {
        currentTarget: '[object Null]',
        isTrusted: false,
        target: '[object Null]',
        type: 'click',
      },
      'Event `MouseEvent` (type=click) captured as exception',
    ],
  ] as [string, Record<string, unknown>, Record<string, unknown>, string][])(
    'has correct exception value for %s',
    (_name, exception, serializedException, expected) => {
      const actual = eventFromUnknownInput(defaultStackParser, exception);
      expect(actual.exception?.values?.[0]?.value).toEqual(expected);

      expect(actual.extra).toEqual({
        __serialized__: serializedException,
      });
    },
  );

  it('handles object with error prop', () => {
    const error = new Error('Some error');
    const event = eventFromUnknownInput(defaultStackParser, {
      foo: { bar: 'baz' },
      name: 'BadType',
      err: error,
    });

    expect(event.exception?.values?.[0]).toEqual(
      expect.objectContaining({
        mechanism: { handled: true, synthetic: true, type: 'generic' },
        type: 'Error',
        value: 'Some error',
      }),
    );
    expect(event.extra).toEqual({
      __serialized__: {
        foo: { bar: 'baz' },
        name: 'BadType',
        err: {
          message: 'Some error',
          name: 'Error',
          stack: expect.stringContaining('Error: Some error'),
        },
      },
    });
  });

  it('handles class with error prop', () => {
    const error = new Error('Some error');

    class MyTestClass {
      prop1 = 'hello';
      prop2 = error;
    }

    const event = eventFromUnknownInput(defaultStackParser, new MyTestClass());

    expect(event.exception?.values?.[0]).toEqual(
      expect.objectContaining({
        mechanism: { handled: true, synthetic: true, type: 'generic' },
        type: 'Error',
        value: 'Some error',
      }),
    );
    expect(event.extra).toEqual({
      __serialized__: {
        prop1: 'hello',
        prop2: {
          message: 'Some error',
          name: 'Error',
          stack: expect.stringContaining('Error: Some error'),
        },
      },
    });
  });
});

describe('extractMessage', () => {
  it('should extract message from a standard Error object', () => {
    const error = new Error('Test error message');
    const message = extractMessage(error);
    expect(message).toBe('Test error message');
  });

  it('should extract message from a WebAssembly.Exception object', () => {
    // https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Exception/Exception#examples
    // @ts-expect-error - WebAssembly.Tag is a valid constructor
    const tag = new WebAssembly.Tag({ parameters: ['i32', 'f32'] });
    // @ts-expect-error - WebAssembly.Exception is a valid constructor
    const wasmException = new WebAssembly.Exception(tag, [42, 42.3]);

    const message = extractMessage(wasmException);
    expect(message).toBe('wasm exception');
  });

  it('should extract nested error message', () => {
    const nestedError = {
      message: {
        error: new Error('Nested error message'),
      },
    };
    const message = extractMessage(nestedError as any);
    expect(message).toBe('Nested error message');
  });

  it('should return "No error message" if message is undefined', () => {
    const error = new Error();
    error.message = undefined as any;
    const message = extractMessage(error);
    expect(message).toBe('No error message');
  });
});

describe('extractName', () => {
  it('should extract name from a standard Error object', () => {
    const error = new Error('Test error message');
    const name = extractType(error);
    expect(name).toBe('Error');
  });

  it('should extract name from a WebAssembly.Exception object', () => {
    // https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Exception/Exception#examples
    // @ts-expect-error - WebAssembly.Tag is a valid constructor
    const tag = new WebAssembly.Tag({ parameters: ['i32', 'f32'] });
    // @ts-expect-error - WebAssembly.Exception is a valid constructor
    const wasmException = new WebAssembly.Exception(tag, [42, 42.3]);

    const name = extractType(wasmException);
    expect(name).toBe('WebAssembly.Exception');
  });

  it('should return undefined if name is not present', () => {
    const error = new Error('Test error message');
    error.name = undefined as any;
    const name = extractType(error);
    expect(name).toBeUndefined();
  });
});
