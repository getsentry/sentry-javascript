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
