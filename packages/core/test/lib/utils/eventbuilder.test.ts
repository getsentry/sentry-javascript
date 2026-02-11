import { describe, expect, it, test } from 'vitest';
import type { Client } from '../../../src/client';
import { eventFromMessage, eventFromUnknownInput, exceptionFromError } from '../../../src/utils/eventbuilder';
import { nodeStackLineParser } from '../../../src/utils/node-stack-trace';
import { addNonEnumerableProperty } from '../../../src/utils/object';
import { createStackParser } from '../../../src/utils/stacktrace';

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
    expect(event.exception?.values?.[0]?.value).toBe("'BadType' captured as exception");

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
    expect(event.exception?.values?.[0]?.value).toBe("'BadType' captured as exception with message 'went wrong'");

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
    expect(event.exception?.values?.[0]?.value).toBe('Object captured as exception with keys: foo, prop');
  });
});

describe('eventFromMessage', () => {
  it('creates an event from a string message', () => {
    const event = eventFromMessage(stackParser, 'Test Message');
    expect(event).toEqual({
      event_id: undefined, // this is undefined because the hint isn't passed
      level: 'info',
      message: 'Test Message',
    });
  });

  it('attaches a synthetic exception if passed and `attachStackTrace` is true', () => {
    const syntheticException = new Error('Test Message');
    const event = eventFromMessage(
      stackParser,
      'Test Message',
      'info',
      { syntheticException, event_id: '123abc' },
      true,
    );

    expect(event).toEqual({
      event_id: '123abc',
      exception: {
        values: [
          {
            mechanism: {
              handled: true,
              synthetic: true,
              type: 'generic',
            },
            stacktrace: {
              frames: expect.any(Array),
            },
            value: 'Test Message',
          },
        ],
      },
      level: 'info',
      message: 'Test Message',
    });
  });

  it("doesn't attach a synthetic exception if `attachStackTrace` is false", () => {
    const syntheticException = new Error('Test Message');
    const event = eventFromMessage(
      stackParser,
      'Test Message',
      'info',
      { syntheticException, event_id: '123abc' },
      false,
    );

    expect(event).toEqual({
      event_id: '123abc',
      level: 'info',
      message: 'Test Message',
    });
  });

  describe('__sentry_fetch_url_host__ error enhancement', () => {
    it('should enhance error message when __sentry_fetch_url_host__ property is present', () => {
      const error = new TypeError('Failed to fetch');
      // Simulate what fetch instrumentation does
      addNonEnumerableProperty(error, '__sentry_fetch_url_host__', 'example.com');

      const exception = exceptionFromError(stackParser, error);

      expect(exception.value).toBe('Failed to fetch (example.com)');
      expect(exception.type).toBe('TypeError');
    });

    it('should not enhance error message when property is missing', () => {
      const error = new TypeError('Failed to fetch');

      const exception = exceptionFromError(stackParser, error);

      expect(exception.value).toBe('Failed to fetch');
      expect(exception.type).toBe('TypeError');
    });

    it('should preserve original error message unchanged', () => {
      const error = new TypeError('Failed to fetch');
      addNonEnumerableProperty(error, '__sentry_fetch_url_host__', 'api.example.com');

      // Original error message should still be accessible
      expect(error.message).toBe('Failed to fetch');

      // But Sentry exception should have enhanced message
      const exception = exceptionFromError(stackParser, error);
      expect(exception.value).toBe('Failed to fetch (api.example.com)');
    });

    it.each([
      { message: 'Failed to fetch', host: 'example.com', expected: 'Failed to fetch (example.com)' },
      { message: 'Load failed', host: 'api.test.com', expected: 'Load failed (api.test.com)' },
      {
        message: 'NetworkError when attempting to fetch resource.',
        host: 'localhost:3000',
        expected: 'NetworkError when attempting to fetch resource. (localhost:3000)',
      },
    ])('should work with all network error types ($message)', ({ message, host, expected }) => {
      const error = new TypeError(message);

      addNonEnumerableProperty(error, '__sentry_fetch_url_host__', host);

      const exception = exceptionFromError(stackParser, error);
      expect(exception.value).toBe(expected);
    });

    it('should not enhance if property value is not a string', () => {
      const error = new TypeError('Failed to fetch');
      addNonEnumerableProperty(error, '__sentry_fetch_url_host__', 123); // Not a string

      const exception = exceptionFromError(stackParser, error);
      expect(exception.value).toBe('Failed to fetch');
    });

    it('should handle errors with stack traces', () => {
      const error = new TypeError('Failed to fetch');
      error.stack = 'TypeError: Failed to fetch\n    at fetch (test.js:1:1)';
      addNonEnumerableProperty(error, '__sentry_fetch_url_host__', 'example.com');

      const exception = exceptionFromError(stackParser, error);
      expect(exception.value).toBe('Failed to fetch (example.com)');
      expect(exception.type).toBe('TypeError');
    });

    it('should preserve hostname with port', () => {
      const error = new TypeError('Failed to fetch');
      addNonEnumerableProperty(error, '__sentry_fetch_url_host__', 'localhost:8080');

      const exception = exceptionFromError(stackParser, error);
      expect(exception.value).toBe('Failed to fetch (localhost:8080)');
    });
  });
});
