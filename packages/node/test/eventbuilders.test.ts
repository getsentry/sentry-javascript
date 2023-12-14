import type { Client } from '@sentry/types';
import { eventFromUnknownInput } from '@sentry/utils';

import { Scope, defaultStackParser, getCurrentHub } from '../src';

const testScope = new Scope();

jest.mock('@sentry/core', () => {
  const original = jest.requireActual('@sentry/core');
  return {
    ...original,
    getCurrentHub(): {
      getClient(): Client;
      getScope(): Scope;
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
          return testScope;
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

    eventFromUnknownInput(getCurrentHub, defaultStackParser, deepObject);

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
