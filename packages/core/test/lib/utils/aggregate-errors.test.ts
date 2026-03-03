import { describe, expect, test } from 'vitest';
import type { ExtendedError } from '../../../src/types-hoist/error';
import type { Event, EventHint } from '../../../src/types-hoist/event';
import type { Exception } from '../../../src/types-hoist/exception';
import type { StackParser } from '../../../src/types-hoist/stacktrace';
import { applyAggregateErrorsToEvent } from '../../../src/utils/aggregate-errors';
import { createStackParser } from '../../../src/utils/stacktrace';

const stackParser = createStackParser([0, line => ({ filename: line })]);
const exceptionFromError = (_stackParser: StackParser, ex: Error): Exception => {
  return { value: ex.message, type: ex.name, mechanism: { type: 'instrument', handled: true } };
};
class FakeAggregateError extends Error {
  public errors: Error[];

  constructor(errors: Error[], message: string) {
    super(message);
    this.errors = errors;
    this.name = 'AggregateError';
  }
}

class CustomAggregateError extends FakeAggregateError {
  public cause?: Error;

  constructor(errors: Error[], message: string, cause?: Error) {
    super(errors, message);
    this.name = 'CustomAggregateError';
    this.cause = cause;
  }
}

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
            type: 'Error',
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
            type: 'Error',
            value: 'Nested Error 1',
            mechanism: {
              exception_id: 1,
              handled: true,
              parent_id: 0,
              source: 'cause',
              type: 'chained',
            },
          },
          {
            type: 'Error',
            value: 'Root Error',
            mechanism: {
              exception_id: 0,
              handled: true,
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
    expect(event.exception?.values?.[event.exception.values.length - 1]).toStrictEqual({
      type: 'Error',
      value: 'Root Error',
      mechanism: {
        exception_id: 0,
        handled: true,
        type: 'instrument',
      },
    });
  });

  test('should keep the original mechanism type for the root exception', () => {
    const fakeAggregateError = new FakeAggregateError(
      [new Error('Nested Error 1'), new Error('Nested Error 2')],
      'Root Error',
    );

    const event: Event = { exception: { values: [exceptionFromError(stackParser, fakeAggregateError)] } };
    const eventHint: EventHint = { originalException: fakeAggregateError };

    applyAggregateErrorsToEvent(exceptionFromError, stackParser, 'cause', 100, event, eventHint);
    expect(event.exception?.values?.[event.exception.values.length - 1]?.mechanism?.type).toBe('instrument');
  });

  test('should assign a defualt mechanism type for the root exception', () => {
    const fakeAggregateError = new FakeAggregateError(
      [new Error('Nested Error 1'), new Error('Nested Error 2')],
      'Root Error',
    );

    const exceptionFromError = (_stackParser: StackParser, ex: Error): Exception => {
      return { value: ex.message, type: ex.name };
    };

    const event: Event = { exception: { values: [exceptionFromError(stackParser, fakeAggregateError)] } };
    const eventHint: EventHint = { originalException: fakeAggregateError };

    applyAggregateErrorsToEvent(exceptionFromError, stackParser, 'cause', 100, event, eventHint);

    expect(event.exception?.values?.[event.exception.values.length - 1]?.mechanism?.type).toBe(
      'auto.core.linked_errors',
    );
  });

  test('should recursively walk mixed errors (Aggregate errors and based on `key`)', () => {
    const chainedError: ExtendedError = new Error('Nested Error 3');
    chainedError.cause = new Error('Nested Error 4');

    const fakeAggregateError2 = new FakeAggregateError([new Error('Nested Error 2'), chainedError], 'AggregateError2');
    const fakeAggregateError1 = new FakeAggregateError(
      [new Error('Nested Error 1'), fakeAggregateError2],
      'AggregateError1',
    );

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
            type: 'Error',
            value: 'Nested Error 4',
          },
          {
            mechanism: {
              exception_id: 4,
              handled: true,
              parent_id: 2,
              source: 'errors[1]',
              type: 'chained',
            },
            type: 'Error',
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
            type: 'Error',
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
            type: 'AggregateError',
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
            type: 'Error',
            value: 'Nested Error 1',
          },
          {
            mechanism: {
              exception_id: 0,
              handled: true,
              is_exception_group: true,
              type: 'instrument',
            },
            type: 'AggregateError',
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
            type: 'Error',
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
            type: 'Error',
            value: 'Nested Error 1',
            mechanism: {
              exception_id: 1,
              handled: true,
              parent_id: 0,
              source: 'cause',
              type: 'chained',
            },
          },
          {
            type: 'Error',
            value: 'Root Error',
            mechanism: {
              exception_id: 0,
              handled: true,
              type: 'instrument',
            },
          },
        ],
      },
    });
  });

  test('marks custom AggregateErrors as exception groups', () => {
    const customAggregateError = new CustomAggregateError(
      [new Error('Nested Error 1')],
      'my CustomAggregateError',
      new Error('Aggregate Cause'),
    );

    const event: Event = { exception: { values: [exceptionFromError(stackParser, customAggregateError)] } };
    const eventHint: EventHint = { originalException: customAggregateError };

    applyAggregateErrorsToEvent(exceptionFromError, stackParser, 'cause', 100, event, eventHint);

    expect(event).toStrictEqual({
      exception: {
        values: [
          {
            mechanism: {
              exception_id: 2,
              handled: true,
              parent_id: 0,
              source: 'errors[0]',
              type: 'chained',
            },
            type: 'Error',
            value: 'Nested Error 1',
          },
          {
            mechanism: {
              exception_id: 1,
              handled: true,
              parent_id: 0,
              source: 'cause',
              type: 'chained',
            },
            type: 'Error',
            value: 'Aggregate Cause',
          },
          {
            mechanism: {
              exception_id: 0,
              handled: true,
              type: 'instrument',
              is_exception_group: true,
            },
            type: 'CustomAggregateError',
            value: 'my CustomAggregateError',
          },
        ],
      },
    });
  });
});
