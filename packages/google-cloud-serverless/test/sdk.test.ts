import { vi, describe, beforeEach, test, expect } from 'vitest';

import { init } from '../src/sdk';

const mockInit = vi.fn();

vi.mock('@sentry/node', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const original = (await vi.importActual('@sentry/node')) as typeof import('@sentry/node');
  return {
    ...original,
    init: (options: unknown) => {
      mockInit(options);
    },
  };
});

describe('init()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('calls Sentry.init with correct sdk info metadata', () => {
    init({});

    expect(mockInit).toBeCalledWith(
      expect.objectContaining({
        _metadata: {
          sdk: {
            name: 'sentry.javascript.google-cloud-serverless',
            packages: [
              {
                name: 'npm:@sentry/google-cloud-serverless',
                version: expect.any(String),
              },
            ],
            version: expect.any(String),
          },
        },
      }),
    );
  });
});
