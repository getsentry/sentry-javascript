import type { Client } from '@sentry/types';

import { defaultStackParser } from '../../src';
import { eventFromPlainObject, exceptionFromError } from '../../src/eventbuilder';

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

describe('exceptionFromError ', () => {
  it('correctly reads error type and value from built-in `Error` subclass', () => {
    const exceptionJSON = exceptionFromError(() => [], new TypeError("Expected type 'ChewToy', got type 'Shoe'"));

    expect(exceptionJSON).toEqual({
      type: 'TypeError',
      value: "Expected type 'ChewToy', got type 'Shoe'",
    });
  });

  it('correctly reads error type and value from user-defined `Error` subclass', () => {
    class DidNotFetch extends Error {}

    const exceptionJSON = exceptionFromError(() => [], new DidNotFetch("Failed to fetch requested object: 'ball'"));

    expect(exceptionJSON).toEqual({
      type: 'DidNotFetch',
      value: "Failed to fetch requested object: 'ball'",
    });
  });
});
