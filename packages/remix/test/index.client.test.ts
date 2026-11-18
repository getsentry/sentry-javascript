import { getCurrentScope, getMainCarrier } from '@sentry/core';
import * as SentryReact from '@sentry/react';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { init } from '../src/index.client';

vi.mock('@sentry/react', { spy: true });

const reactInit = SentryReact.init as Mock;

describe('Client init()', () => {
  afterEach(() => {
    vi.clearAllMocks();

    getMainCarrier().__SENTRY__ = undefined;
  });

  it('inits the React SDK', () => {
    expect(reactInit).toHaveBeenCalledTimes(0);
    init({});
    expect(reactInit).toHaveBeenCalledTimes(1);
    expect(reactInit).toHaveBeenCalledWith(
      expect.objectContaining({
        _metadata: {
          sdk: {
            name: 'sentry.javascript.remix',
            version: expect.any(String),
            packages: [
              {
                name: 'npm:@sentry/remix',
                version: expect.any(String),
              },
              {
                name: 'npm:@sentry/react',
                version: expect.any(String),
              },
            ],
            settings: {
              infer_ip: 'auto',
            },
          },
        },
      }),
    );
  });

  it('passes the Remix route provider unless the user passed one', () => {
    init({});
    expect(reactInit).toHaveBeenLastCalledWith(
      expect.objectContaining({ routeProvider: expect.objectContaining({ resolveRoute: expect.any(Function) }) }),
    );

    getCurrentScope().setClient(undefined);
    const routeProvider = { resolveRoute: () => '/custom', resolveCurrentRoute: () => '/custom' };
    init({ routeProvider });
    expect(reactInit).toHaveBeenLastCalledWith(expect.objectContaining({ routeProvider }));
  });

  describe('release', () => {
    afterEach(() => {
      delete (globalThis as { __remixContext?: unknown }).__remixContext;
    });

    it('reads the release the server build added to the Remix context', () => {
      (globalThis as { __remixContext?: unknown }).__remixContext = { sentryRelease: 'page-release' };

      init({});

      expect(reactInit).toHaveBeenLastCalledWith(expect.objectContaining({ release: 'page-release' }));
    });

    it('prefers an explicit release', () => {
      (globalThis as { __remixContext?: unknown }).__remixContext = { sentryRelease: 'page-release' };

      init({ release: 'explicit-release' });

      expect(reactInit).toHaveBeenLastCalledWith(expect.objectContaining({ release: 'explicit-release' }));
    });

    // An explicit `release: undefined` would override the browser SDK's `SENTRY_RELEASE` fallback.
    it('sets no release when the Remix context has none', () => {
      (globalThis as { __remixContext?: unknown }).__remixContext = {};

      init({});

      expect(reactInit.mock.lastCall?.[0]).not.toHaveProperty('release');
    });
  });

  it('returns client from init', () => {
    expect(init({})).not.toBeUndefined();
  });
});
