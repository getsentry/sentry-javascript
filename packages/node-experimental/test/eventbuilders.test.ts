import { eventFromUnknownInput } from '@sentry/utils';

import { defaultStackParser } from '../src';

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

    const client = {
      getOptions(): any {
        return { normalizeDepth: 6 };
      },
    } as any;
    const event = eventFromUnknownInput(client, defaultStackParser, deepObject);

    const serializedObject = event.extra?.__serialized__;
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
