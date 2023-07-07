import type { Event, EventHint, Exception, ExtendedError, StackParser } from '@sentry/types';

import { applyAggregateErrorsToEvent, createStackParser } from '../src/index';

const stackParser = createStackParser([0, line => ({ filename: line })]);
const exceptionFromError = (_stackParser: StackParser, ex: Error): Exception => {
  return { value: ex.message, mechanism: { type: 'instrument', handled: true } };
};

describe('applyAggregateErrorsToEvent()', () => {
  test('should not do anything if event does not contain an exception', () => {
    const event: Event = { exception: undefined };
    const eventHint: EventHint = { originalException: new Error() };
    applyAggregateErrorsToEvent(exceptionFromError, stackParser, 'cause', 100, event, eventHint);

    // no changes
    expect(event).toStrictEqual({ exception: undefined });
  });

  test('should not do anything if event does not contain exception values', () => {
    const event: Event = { exception: { values: undefined } };
    const eventHint: EventHint = { originalException: new Error() };
    applyAggregateErrorsToEvent(exceptionFromError, stackParser, 'cause', 100, event, eventHint);

    // no changes
    expect(event).toStrictEqual({ exception: { values: undefined } });
  });

  test('should not do anything if event does not contain an event hint', () => {
    const event: Event = { exception: { values: [] } };
    applyAggregateErrorsToEvent(exceptionFromError, stackParser, 'cause', 100, event, undefined);

    // no changes
    expect(event).toStrictEqual({ exception: { values: [] } });
  });

  test('should not do anything if the event hint does not contain an original exception', () => {
    const event: Event = { exception: { values: [] } };
    const eventHint: EventHint = { originalException: undefined };
    applyAggregateErrorsToEvent(exceptionFromError, stackParser, 'cause', 100, event, eventHint);

    // no changes
    expect(event).toStrictEqual({ exception: { values: [] } });
  });

  test('should recursively walk the original exception based on the `key` option and add them as exceptions to the event', () => {
    const key = 'cause';
    const originalException: ExtendedError = new Error('Root Error');
    originalException[key] = new Error('Nested Error 1');
    originalException[key][key] = new Error('Nested Error 2');

    const event: Event = { exception: { values: [exceptionFromError(stackParser, originalException)] } };
    const eventHint: EventHint = { originalException };

    applyAggregateErrorsToEvent(exceptionFromError, stackParser, key, 100, event, eventHint);
    expect(event).toStrictEqual({
      exception: {
        values: [
          {
            value: 'Nested Error 2',
            mechanism: {
              exception_id: 2,
              handled: true,
              parent_id: 1,
              source: 'cause',
              type: 'chained',
            },
          },
          {
            value: 'Nested Error 1',
            mechanism: {
              exception_id: 1,
              handled: true,
              parent_id: 0,
              is_exception_group: true,
              source: 'cause',
              type: 'chained',
            },
          },
          {
            value: 'Root Error',
            mechanism: {
              exception_id: 0,
              handled: true,
              is_exception_group: true,
              type: 'instrument',
            },
          },
        ],
      },
    });
  });

  test('should not modify event if there are no attached errors', () => {
    const originalException: ExtendedError = new Error('Some Error');

    const event: Event = { exception: { values: [exceptionFromError(stackParser, originalException)] } };
    const eventHint: EventHint = { originalException };

    applyAggregateErrorsToEvent(exceptionFromError, stackParser, 'cause', 100, event, eventHint);

    // no changes
    expect(event).toStrictEqual({ exception: { values: [exceptionFromError(stackParser, originalException)] } });
  });

  test('should allow to limit number of attached errors', () => {
    const key = 'cause';
    const originalException: ExtendedError = new Error('Root Error');
    const event: Event = { exception: { values: [exceptionFromError(stackParser, originalException)] } };

    let err = originalException;
    for (let i = 0; i < 10; i++) {
      const newErr = new Error('Nested Error!');
      err[key] = newErr;
      err = newErr;
    }

    const eventHint: EventHint = { originalException };
    applyAggregateErrorsToEvent(exceptionFromError, stackParser, key, 5, event, eventHint);

    // 6 -> one for original exception + 5 linked
    expect(event.exception?.values).toHaveLength(5 + 1);

    // Last exception in list should be the root exception
    expect(event.exception?.values?.[event.exception?.values.length - 1]).toStrictEqual({
      value: 'Root Error',
      mechanism: {
        exception_id: 0,
        handled: true,
        is_exception_group: true,
        type: 'instrument',
      },
    });
  });

  test('should keep the original mechanism type for the root exception', () => {
    const fakeAggregateError: ExtendedError = new Error('Root Error');
    fakeAggregateError.errors = [new Error('Nested Error 1'), new Error('Nested Error 2')];

    const event: Event = { exception: { values: [exceptionFromError(stackParser, fakeAggregateError)] } };
    const eventHint: EventHint = { originalException: fakeAggregateError };

    applyAggregateErrorsToEvent(exceptionFromError, stackParser, 'cause', 100, event, eventHint);
    expect(event.exception?.values?.[event.exception.values.length - 1].mechanism?.type).toBe('instrument');
  });

  test('should recursively walk mixed errors (Aggregate errors and based on `key`)', () => {
    const chainedError: ExtendedError = new Error('Nested Error 3');
    chainedError.cause = new Error('Nested Error 4');
    const fakeAggregateError2: ExtendedError = new Error('AggregateError2');
    fakeAggregateError2.errors = [new Error('Nested Error 2'), chainedError];
    const fakeAggregateError1: ExtendedError = new Error('AggregateError1');
    fakeAggregateError1.errors = [new Error('Nested Error 1'), fakeAggregateError2];

    const event: Event = { exception: { values: [exceptionFromError(stackParser, fakeAggregateError1)] } };
    const eventHint: EventHint = { originalException: fakeAggregateError1 };

    applyAggregateErrorsToEvent(exceptionFromError, stackParser, 'cause', 100, event, eventHint);
    expect(event).toStrictEqual({
      exception: {
        values: [
          {
            mechanism: {
              exception_id: 5,
              handled: true,
              parent_id: 4,
              source: 'cause',
              type: 'chained',
            },
            value: 'Nested Error 4',
          },
          {
            mechanism: {
              exception_id: 4,
              handled: true,
              is_exception_group: true,
              parent_id: 2,
              source: 'errors[1]',
              type: 'chained',
            },
            value: 'Nested Error 3',
          },
          {
            mechanism: {
              exception_id: 3,
              handled: true,
              parent_id: 2,
              source: 'errors[0]',
              type: 'chained',
            },
            value: 'Nested Error 2',
          },
          {
            mechanism: {
              exception_id: 2,
              handled: true,
              is_exception_group: true,
              parent_id: 0,
              source: 'errors[1]',
              type: 'chained',
            },
            value: 'AggregateError2',
          },
          {
            mechanism: {
              exception_id: 1,
              handled: true,
              parent_id: 0,
              source: 'errors[0]',
              type: 'chained',
            },
            value: 'Nested Error 1',
          },
          {
            mechanism: {
              exception_id: 0,
              handled: true,
              is_exception_group: true,
              type: 'instrument',
            },
            value: 'AggregateError1',
          },
        ],
      },
    });
  });

  test('should keep the original mechanism type for the root exception', () => {
    const key = 'cause';
    const originalException: ExtendedError = new Error('Root Error');
    originalException[key] = new Error('Nested Error 1');
    originalException[key][key] = new Error('Nested Error 2');

    const event: Event = { exception: { values: [exceptionFromError(stackParser, originalException)] } };
    const eventHint: EventHint = { originalException };

    applyAggregateErrorsToEvent(exceptionFromError, stackParser, key, 100, event, eventHint);
    expect(event).toStrictEqual({
      exception: {
        values: [
          {
            value: 'Nested Error 2',
            mechanism: {
              exception_id: 2,
              handled: true,
              parent_id: 1,
              source: 'cause',
              type: 'chained',
            },
          },
          {
            value: 'Nested Error 1',
            mechanism: {
              exception_id: 1,
              handled: true,
              parent_id: 0,
              is_exception_group: true,
              source: 'cause',
              type: 'chained',
            },
          },
          {
            value: 'Root Error',
            mechanism: {
              exception_id: 0,
              handled: true,
              is_exception_group: true,
              type: 'instrument',
            },
          },
        ],
      },
    });
  });
});
