/**
 * @vitest-environment jsdom
 */

import { SDK_VERSION } from '@sentry/browser';
import * as SentryBrowser from '@sentry/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init as svelteInit } from '../src/sdk';

const browserInit = vi.spyOn(SentryBrowser, 'init');

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
          settings: {
            infer_ip: 'never',
          },
        },
      },
    };

    expect(browserInit).toHaveBeenCalledTimes(1);
    expect(browserInit).toHaveBeenLastCalledWith(expect.objectContaining(expectedMetadata));
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
          settings: {
            infer_ip: 'never',
          },
        },
      },
    });

    expect(browserInit).toHaveBeenCalledTimes(1);
    expect(browserInit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        _metadata: {
          sdk: {
            name: 'sentry.javascript.sveltekit',
            version: SDK_VERSION,
            packages: [
              { name: 'npm:@sentry/sveltekit', version: SDK_VERSION },
              { name: 'npm:@sentry/svelte', version: SDK_VERSION },
            ],
            settings: {
              infer_ip: 'never',
            },
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
