import { SDK_VERSION } from '@sentry/node';
import * as SentryNode from '@sentry/node';

import { vi } from 'vitest';
import { init as solidStartInit } from '../../src/server';

const browserInit = vi.spyOn(SentryNode, 'init');

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
            { name: 'npm:@sentry/node', version: SDK_VERSION },
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

    expect(SentryNode.getIsolationScope().getScopeData().tags).toEqual({ runtime: 'node' });
  });
});
