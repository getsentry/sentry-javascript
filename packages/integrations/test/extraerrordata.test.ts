import type { Event as SentryEvent, ExtendedError } from '@sentry/types';

import { ExtraErrorData } from '../src/extraerrordata';

const extraErrorData = new ExtraErrorData();
let event: SentryEvent;

describe('ExtraErrorData()', () => {
  beforeEach(() => {
    event = {};
  });

  it('should enhance event with extra data extracted from the error', () => {
    const error = new TypeError('foo') as ExtendedError;
    error.baz = 42;
    error.foo = 'bar';

    const enhancedEvent = extraErrorData.enhanceEventWithErrorData(event, {
      originalException: error,
    });

    expect(enhancedEvent.contexts).toEqual({
      TypeError: {
        baz: 42,
        foo: 'bar',
      },
    });
  });

  it('doesnt choke on linked errors and stringify names instead', () => {
    const error = new TypeError('foo') as ExtendedError;
    error.cause = new SyntaxError('bar');

    const enhancedEvent = extraErrorData.enhanceEventWithErrorData(event, {
      originalException: error,
    });

    expect(enhancedEvent.contexts).toEqual({
      TypeError: {
        cause: 'SyntaxError: bar',
      },
    });
  });

  it('should stringify up to 3 nested levels by default', () => {
    const error = new TypeError('foo') as ExtendedError;
    error['1'] = {
      2: {
        3: {
          4: 'foo',
        },
      },
    };

    const enhancedEvent = extraErrorData.enhanceEventWithErrorData(event, {
      originalException: error,
    });

    expect(enhancedEvent.contexts).toEqual({
      TypeError: {
        1: {
          2: {
            3: '[Object]',
          },
        },
      },
    });
  });

  it('should not remove previous data existing in extra field', () => {
    event = {
      // @ts-ignore Allow contexts on event
      contexts: {
        foo: { bar: 42 },
      },
    };
    const error = new TypeError('foo') as ExtendedError;
    error.baz = 42;

    const enhancedEvent = extraErrorData.enhanceEventWithErrorData(event, {
      originalException: error,
    });

    expect(enhancedEvent.contexts).toEqual({
      TypeError: {
        baz: 42,
      },
      foo: { bar: 42 },
    });
  });

  it('should return event if originalException is not an Error object', () => {
    const error = 'error message, not object';

    const enhancedEvent = extraErrorData.enhanceEventWithErrorData(event, {
      originalException: error,
    });

    expect(enhancedEvent).toEqual(event);
  });

  it('should return event if there is no SentryEventHint', () => {
    const enhancedEvent = extraErrorData.enhanceEventWithErrorData(event);

    expect(enhancedEvent).toEqual(event);
  });

  it('should return event if there is no originalException', () => {
    const enhancedEvent = extraErrorData.enhanceEventWithErrorData(event, {
      // @ts-ignore Allow event to have extra properties
      notOriginalException: 'fooled you',
    });

    expect(enhancedEvent).toEqual(event);
  });

  it('should call toJSON of original exception and add its properties', () => {
    const error = new TypeError('foo') as ExtendedError;
    error.baz = 42;
    error.foo = 'bar';
    error.toJSON = function () {
      return {
        bar: 1337,
        qux: `${this.message} but nicer`,
      };
    };

    const enhancedEvent = extraErrorData.enhanceEventWithErrorData(event, {
      originalException: error,
    });

    expect(enhancedEvent.contexts).toEqual({
      TypeError: {
        bar: 1337,
        baz: 42,
        foo: 'bar',
        qux: 'foo but nicer',
      },
    });
  });

  it('toJSON props should have priority over directly assigned ones', () => {
    const error = new TypeError('foo') as ExtendedError;
    error.baz = 42;
    error.toJSON = function () {
      return {
        baz: 1337,
      };
    };

    const enhancedEvent = extraErrorData.enhanceEventWithErrorData(event, {
      originalException: error,
    });

    expect(enhancedEvent.contexts).toEqual({
      TypeError: {
        baz: 1337,
      },
    });
  });

  it('toJSON props should allow for usage of native names', () => {
    const error = new TypeError('foo') as ExtendedError;
    error.baz = 42;
    error.toJSON = function () {
      return {
        message: 'bar',
      };
    };

    const enhancedEvent = extraErrorData.enhanceEventWithErrorData(event, {
      originalException: error,
    });

    expect(enhancedEvent.contexts).toEqual({
      TypeError: {
        baz: 42,
        message: 'bar',
      },
    });
  });
});
