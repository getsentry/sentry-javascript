import type { Client } from '@sentry/types';

import { defaultStackParser, Scope } from '../src';
import { eventFromUnknownInput } from '../src/eventbuilder';

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
