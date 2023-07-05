import type { Event, EventHint, Exception, ExtendedError, StackParser } from '@sentry/types';

import { applyAggregateErrorsToEvent, createStackParser } from '../src/index';

const stackParser = createStackParser([0, line => ({ filename: line })]);
const exceptionFromError = (_stackParser: StackParser, ex: Error): Exception => {
  return { value: ex.message };
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
    const event: Event = { exception: { values: [exceptionFromError(stackParser, originalException)] } };
    originalException[key] = new Error('Nested Error 1');
    originalException[key][key] = new Error('Nested Error 2');
    const eventHint: EventHint = { originalException };
    applyAggregateErrorsToEvent(exceptionFromError, stackParser, key, 100, event, eventHint);
    expect(event).toStrictEqual({
      exception: {
        values: [
          {
            value: 'Nested Error 2',
          },
          {
            value: 'Nested Error 1',
          },
          {
            value: 'Root Error',
          },
        ],
      },
    });
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
  });

  test.todo('should recursively walk AggregateErrors and add them as exceptions to the event');
  test.todo('should recursively walk mixed errors (Aggregate errors and based on `key`)');
});
