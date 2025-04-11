import { afterEach, describe, expect, it, vi } from 'vitest';

import * as SentryBrowser from '@sentry/browser';
import { SDK_VERSION, getCurrentScope, getGlobalScope, getIsolationScope } from '@sentry/browser';

import { init as reactRouterInit } from '../../src/client';

const browserInit = vi.spyOn(SentryBrowser, 'init');

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
          },
        },
      };

      expect(browserInit).toHaveBeenCalledTimes(1);
      expect(browserInit).toHaveBeenCalledWith(expect.objectContaining(expectedMetadata));
    });

    it('returns client from init', () => {
      expect(reactRouterInit({})).not.toBeUndefined();
    });
  });
});
