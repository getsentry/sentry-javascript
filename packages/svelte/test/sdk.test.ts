import { init as browserInitRaw, SDK_VERSION } from '@sentry/browser';

import { init as svelteInit } from '../src/sdk';

const browserInit = browserInitRaw as jest.Mock;
jest.mock('@sentry/browser');

describe('Initialize Svelte SDk', () => {
  afterAll(() => {
    jest.clearAllMocks();
  });

  it('has the correct metadata', () => {
    svelteInit({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    });

    const expectedMetadata = {
      _metadata: {
        sdk: {
          name: 'sentry.javascript.svelte',
          packages: [{ name: 'npm:@sentry/svelte', version: SDK_VERSION }],
          version: SDK_VERSION,
        },
      },
    };

    expect(browserInit).toHaveBeenCalledTimes(1);
    expect(browserInit).toHaveBeenCalledWith(expect.objectContaining(expectedMetadata));
  });
});
