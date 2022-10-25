import { Client, StackParser } from '@sentry/types';

import { defaultStackParser } from '../../src';
import { eventFromMessage, eventFromPlainObject } from '../../src/eventbuilder';

jest.mock('@sentry/core', () => {
  const original = jest.requireActual('@sentry/core');
  return {
    ...original,
    getCurrentHub(): {
      getClient(): Client;
    } {
      return {
        getClient(): any {
          return {
            getOptions(): any {
              return { normalizeDepth: 6 };
            },
          };
        },
      };
    },
  };
});

afterEach(() => {
  jest.resetAllMocks();
});

describe('eventFromPlainObject', () => {
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

    const event = eventFromPlainObject(defaultStackParser, deepObject);

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
});

describe('eventFromMessage', () => {
  test('message has stack trace in threads and no exception field', async () => {
    const event = await eventFromMessage(
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
