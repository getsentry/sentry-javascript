import type { Client } from '@sentry/types';

import { createStackParser, eventFromUnknownInput, nodeStackLineParser } from '../src';

const stackParser = createStackParser(nodeStackLineParser());

class MyTestClass {
  prop1 = 'hello';
  prop2 = 2;
}

describe('eventFromUnknownInput', () => {
  const fakeClient = {
    getOptions: () => ({}),
  } as Client;
  test('object with useless props', () => {
    const event = eventFromUnknownInput(fakeClient, stackParser, { foo: { bar: 'baz' }, prop: 1 });

    expect(event.exception?.values?.[0]).toEqual(
      expect.objectContaining({
        mechanism: { handled: true, synthetic: true, type: 'generic' },
        type: 'Error',
        value: 'Object captured as exception with keys: foo, prop',
      }),
    );
    expect(event.extra).toEqual({
      __serialized__: { foo: { bar: 'baz' }, prop: 1 },
    });
  });

  test('object with name prop', () => {
    const event = eventFromUnknownInput(fakeClient, stackParser, { foo: { bar: 'baz' }, name: 'BadType' });
    expect(event.exception?.values?.[0].value).toBe("'BadType' captured as exception");

    expect(event.exception?.values?.[0]).toEqual(
      expect.objectContaining({
        mechanism: { handled: true, synthetic: true, type: 'generic' },
        type: 'Error',
        value: "'BadType' captured as exception",
      }),
    );
    expect(event.extra).toEqual({
      __serialized__: { foo: { bar: 'baz' }, name: 'BadType' },
    });
  });

  test('object with name and message props', () => {
    const event = eventFromUnknownInput(fakeClient, stackParser, { message: 'went wrong', name: 'BadType' });
    expect(event.exception?.values?.[0].value).toBe("'BadType' captured as exception with message 'went wrong'");

    expect(event.exception?.values?.[0]).toEqual(
      expect.objectContaining({
        mechanism: { handled: true, synthetic: true, type: 'generic' },
        type: 'Error',
        value: "'BadType' captured as exception with message 'went wrong'",
      }),
    );
    expect(event.extra).toEqual({
      __serialized__: { message: 'went wrong', name: 'BadType' },
    });
  });

  test('object with message prop', () => {
    const event = eventFromUnknownInput(fakeClient, stackParser, { foo: { bar: 'baz' }, message: 'Some message' });

    expect(event.exception?.values?.[0]).toEqual(
      expect.objectContaining({
        mechanism: { handled: true, synthetic: true, type: 'generic' },
        type: 'Error',
        value: 'Some message',
      }),
    );
    expect(event.extra).toEqual({
      __serialized__: { foo: { bar: 'baz' }, message: 'Some message' },
    });
  });

  test('object with error prop', () => {
    const error = new Error('Some error');
    const event = eventFromUnknownInput(fakeClient, stackParser, {
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

    const event = eventFromUnknownInput(fakeClient, stackParser, new MyTestClass());

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

  it.each([
    ['empty object', {}, 'Object captured as exception with keys: [object has no keys]'],
    ['pojo', { prop1: 'hello', prop2: 2 }, 'Object captured as exception with keys: prop1, prop2'],
    ['Custom Class', new MyTestClass(), "'MyTestClass' captured as exception with keys: prop1, prop2"],
  ] as [string, Record<string, unknown>, string][])(
    'has correct exception value for %s',
    (_name, exception, expected) => {
      const actual = eventFromUnknownInput(fakeClient, stackParser, exception);
      expect(actual.exception?.values?.[0]?.value).toEqual(expected);

      expect(actual.extra).toEqual({
        __serialized__: exception,
      });
    },
  );

  test('passing client directly', () => {
    const event = eventFromUnknownInput(fakeClient, stackParser, { foo: { bar: 'baz' }, prop: 1 });
    expect(event.exception?.values?.[0].value).toBe('Object captured as exception with keys: foo, prop');
  });
});
