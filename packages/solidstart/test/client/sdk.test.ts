import { SDK_VERSION } from '@sentry/solid';
import * as SentrySolid from '@sentry/solid';

import { vi } from 'vitest';
import { init as solidStartInit } from '../../src/client';

const browserInit = vi.spyOn(SentrySolid, 'init');

describe('Initialize Solid Start SDK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has the correct metadata', () => {
    const client = solidStartInit({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    });

    const expectedMetadata = {
      _metadata: {
        sdk: {
          name: 'sentry.javascript.solidstart',
          packages: [
            { name: 'npm:@sentry/solidstart', version: SDK_VERSION },
            { name: 'npm:@sentry/solid', version: SDK_VERSION },
          ],
          version: SDK_VERSION,
        },
      },
    };

    expect(client).not.toBeUndefined();
    expect(browserInit).toHaveBeenCalledTimes(1);
    expect(browserInit).toHaveBeenLastCalledWith(expect.objectContaining(expectedMetadata));
  });

  it('sets the runtime tag on the isolation scope', () => {
    solidStartInit({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });
  });
});
