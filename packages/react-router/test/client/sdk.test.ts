import * as SentryBrowser from '@sentry/browser';
import { getCurrentScope, getGlobalScope, getIsolationScope, SDK_VERSION } from '@sentry/browser';
import * as SentryCore from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { init as reactRouterInit } from '../../src/client';

const browserInit = vi.spyOn(SentryBrowser, 'init');
const setTag = vi.spyOn(SentryCore, 'setTag');
const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('React Router client SDK', () => {
  describe('init', () => {
    afterEach(() => {
      vi.clearAllMocks();

      getGlobalScope().clear();
      getIsolationScope().clear();
      getCurrentScope().clear();
      getCurrentScope().setClient(undefined);
    });

    it('adds React Router metadata to the SDK options', () => {
      expect(browserInit).not.toHaveBeenCalled();

      reactRouterInit({});

      const expectedMetadata = {
        _metadata: {
          sdk: {
            name: 'sentry.javascript.react-router',
            version: SDK_VERSION,
            packages: [
              { name: 'npm:@sentry/react-router', version: SDK_VERSION },
              { name: 'npm:@sentry/browser', version: SDK_VERSION },
            ],
            settings: {
              infer_ip: 'never',
            },
          },
        },
      };

      expect(browserInit).toHaveBeenCalledTimes(1);
      expect(browserInit).toHaveBeenCalledWith(expect.objectContaining(expectedMetadata));
    });

    it('returns client from init', () => {
      expect(reactRouterInit({})).not.toBeUndefined();
    });

    it('sets the runtime tag to browser', () => {
      reactRouterInit({});
      expect(setTag).toHaveBeenCalledWith('runtime', 'browser');
    });

    it('warns if BrowserTracing integration is present', () => {
      reactRouterInit({
        integrations: [{ name: 'BrowserTracing' }],
      });

      expect(consoleWarn).toHaveBeenCalledWith(
        'browserTracingIntegration is not fully compatible with @sentry/react-router. Please use reactRouterTracingIntegration instead.',
      );
    });
  });
});
