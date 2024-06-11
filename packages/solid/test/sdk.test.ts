import { SDK_VERSION } from '@sentry/browser';
import * as SentryBrowser from '@sentry/browser';

import { vi } from 'vitest';
import { init as solidInit } from '../src/sdk';

const browserInit = vi.spyOn(SentryBrowser, 'init');

describe('Initialize Solid SDk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has the correct metadata', () => {
    solidInit({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    });

    const expectedMetadata = {
      _metadata: {
        sdk: {
          name: 'sentry.javascript.solid',
          packages: [{ name: 'npm:@sentry/solid', version: SDK_VERSION }],
          version: SDK_VERSION,
        },
      },
    };

    expect(browserInit).toHaveBeenCalledTimes(1);
    expect(browserInit).toHaveBeenLastCalledWith(expect.objectContaining(expectedMetadata));
  });
});
