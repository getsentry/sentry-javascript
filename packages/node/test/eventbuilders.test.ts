import { Client, StackParser } from '@sentry/types';

import { defaultStackParser, Scope } from '../src';
import { eventFromMessage, eventFromUnknownInput } from '../src/eventbuilder';

const testScope = new Scope();

jest.mock('@sentry/core', () => {
  const original = jest.requireActual('@sentry/core');
  return {
    ...original,
    getCurrentHub(): {
      getClient(): Client;
      getScope(): Scope;
      configureScope(scopeFunction: (scope: Scope) => void): void;
    } {
      return {
        getClient(): any {
          return {
            getOptions(): any {
              return { normalizeDepth: 6 };
            },
          };
        },
        getScope(): Scope {
          return new Scope();
        },
        configureScope(scopeFunction: (scope: Scope) => void): void {
          scopeFunction(testScope);
        },
      };
    },
  };
});

afterEach(() => {
  jest.resetAllMocks();
});

describe('eventFromUnknownInput', () => {
  test('uses normalizeDepth from init options', () => {
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

    eventFromUnknownInput(defaultStackParser, deepObject);

    const serializedObject = (testScope as any)._extra.__serialized__;
    expect(serializedObject).toBeDefined();
    expect(serializedObject).toEqual({
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
});

describe('eventFromMessage', () => {
  test('message has stack trace in threads and no exception field', () => {
    const event = eventFromMessage(
      getMockedStackParser(),
      'test_message',
      'info',
      {
        syntheticException: getMockedSyntheticException(),
      },
      true,
    );
    expect(event.exception).toBeUndefined();
    expect(event.threads).toBeDefined();
    expect(event.threads!.values[0].stacktrace?.frames?.[0]).toEqual({ filename: 'mocked_stack_frame_filename' });
  });

  function getMockedSyntheticException(): Error {
    return {
      message: 'synthetic_message',
      stack: 'synthetic_stack',
      name: 'synthetic_exception_name',
    };
  }

  function getMockedStackParser(): StackParser {
    return (_stacktrace: string, _skipFirst?: number) => [{ filename: 'mocked_stack_frame_filename' }];
  }
});
