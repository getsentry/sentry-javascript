import type { Client } from '@sentry/types';

import { defaultStackParser, Scope } from '../src';
import { eventFromUnknownInput, exceptionFromError } from '../src/eventbuilder';

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
