import { BrowserClient, SDK_VERSION } from '@sentry/browser';
import * as SentryBrowser from '@sentry/browser';
import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../src/sdk';

const initAndBind = vi.spyOn(SentryCore, 'initAndBind');

// Mock this to avoid the "duplicate integration" error message
vi.spyOn(SentryBrowser, 'browserTracingIntegration').mockImplementation(() => {
  return {
    name: 'BrowserTracing',
    setupOnce: vi.fn(),
    afterAllSetup: vi.fn(),
  };
});

describe('Initialize Solid SDK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has the correct metadata', () => {
    const client = init({
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

    expect(client).not.toBeUndefined();
    expect(initAndBind).toHaveBeenCalledTimes(1);
    expect(initAndBind).toHaveBeenLastCalledWith(BrowserClient, expect.objectContaining(expectedMetadata));
  });
});
