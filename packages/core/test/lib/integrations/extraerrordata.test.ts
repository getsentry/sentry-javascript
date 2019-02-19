import { ExtendedError, SentryEvent } from '@sentry/types';
import { ExtraErrorData } from '../../../src/integrations/extraerrordata';

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

    expect(enhancedEvent.extra).toEqual({
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

    expect(enhancedEvent.extra).toEqual({
      TypeError: {
        cause: 'SyntaxError',
      },
    });
  });

  it('should not remove previous data existing in extra field', () => {
    event = {
      extra: {
        foo: 42,
      },
    };
    const error = new TypeError('foo') as ExtendedError;
    error.baz = 42;

    const enhancedEvent = extraErrorData.enhanceEventWithErrorData(event, {
      originalException: error,
    });

    expect(enhancedEvent.extra).toEqual({
      TypeError: {
        baz: 42,
      },
      foo: 42,
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
      notOriginalException: 'fooled you',
    });

    expect(enhancedEvent).toEqual(event);
  });
});
