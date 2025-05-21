/**
 * @vitest-environment jsdom
 */

import { BrowserClient, SDK_VERSION } from '@sentry/browser';
import * as SentryBrowser from '@sentry/browser';
import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init as svelteInit } from '../src/sdk';

const initAndBind = vi.spyOn(SentryCore, 'initAndBind');

// Mock this to avoid the "duplicate integration" error message
vi.spyOn(SentryBrowser, 'browserTracingIntegration').mockImplementation(() => {
  return {
    name: 'BrowserTracing',
    setupOnce: vi.fn(),
    afterAllSetup: vi.fn(),
  };
});

describe('Initialize Svelte SDk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    expect(initAndBind).toHaveBeenCalledTimes(1);
    expect(initAndBind).toHaveBeenLastCalledWith(BrowserClient, expect.objectContaining(expectedMetadata));
  });

  it("doesn't add the default svelte metadata, if metadata is already passed", () => {
    svelteInit({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      _metadata: {
        sdk: {
          name: 'sentry.javascript.sveltekit',
          version: SDK_VERSION,
          packages: [
            { name: 'npm:@sentry/sveltekit', version: SDK_VERSION },
            { name: 'npm:@sentry/svelte', version: SDK_VERSION },
          ],
        },
      },
    });

    expect(initAndBind).toHaveBeenCalledTimes(1);
    expect(initAndBind).toHaveBeenLastCalledWith(
      BrowserClient,
      expect.objectContaining({
        _metadata: {
          sdk: {
            name: 'sentry.javascript.sveltekit',
            version: SDK_VERSION,
            packages: [
              { name: 'npm:@sentry/sveltekit', version: SDK_VERSION },
              { name: 'npm:@sentry/svelte', version: SDK_VERSION },
            ],
          },
        },
      }),
    );
  });

  it('returns client from init', () => {
    const client = svelteInit({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    });

    expect(client).not.toBeUndefined();
  });
});
