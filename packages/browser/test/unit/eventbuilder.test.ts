import { defaultStackParser } from '../../src';
import { eventFromUnknownInput } from '../../src/eventbuilder';

jest.mock('@sentry/core', () => {
  const original = jest.requireActual('@sentry/core');
  return {
    ...original,
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
  jest.resetAllMocks();
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

    expect(event?.extra?.__serialized__).toEqual({
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
