import type { Client } from '@sentry/types';

import { defaultStackParser } from '../../src';
import { eventFromPlainObject } from '../../src/eventbuilder';

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

class MyTestClass {
  prop1 = 'hello';
  prop2 = 2;
}

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

  it.each([
    ['empty object', {}, 'Object captured as exception with keys: [object has no keys]'],
    ['pojo', { prop1: 'hello', prop2: 2 }, 'Object captured as exception with keys: prop1, prop2'],
    ['Custom Class', new MyTestClass(), '`MyTestClass` captured as exception with keys: prop1, prop2'],
    [
      'Event',
      new Event('custom'),
      'Event `Event` (custom) captured as exception with keys: currentTarget, isTrusted, target, type',
    ],
    [
      'MouseEvent',
      new MouseEvent('click'),
      'Event `MouseEvent` (click) captured as exception with keys: currentTarget, isTrusted, target, type',
    ],
  ] as [string, Record<string, unknown>, string][])(
    'has correct exception value for %s',
    (_name, exception, expected) => {
      const actual = eventFromPlainObject(defaultStackParser, exception);
      expect(actual.exception?.values?.[0]?.value).toEqual(expected);
    },
  );
});
