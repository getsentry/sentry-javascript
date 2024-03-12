import { init } from '../src/sdk';

const mockInit = jest.fn();

jest.mock('@sentry/node', () => {
  const original = jest.requireActual('@sentry/node');
  return {
    ...original,
    init: (options: unknown) => {
      mockInit(options);
    },
  };
});

describe('init()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
