import { SDK_VERSION } from '@sentry/vue';
import * as SentryVue from '@sentry/vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/client';

const vueInit = vi.spyOn(SentryVue, 'init');

describe('Nuxt Client SDK', () => {
  describe('init', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('Adds Nuxt metadata to the SDK options', () => {
      expect(vueInit).not.toHaveBeenCalled();

      init({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      });

      const expectedMetadata = {
        _metadata: {
          sdk: {
            name: 'sentry.javascript.nuxt',
            version: SDK_VERSION,
            packages: [
              { name: 'npm:@sentry/nuxt', version: SDK_VERSION },
              { name: 'npm:@sentry/vue', version: SDK_VERSION },
            ],
          },
        },
      };

      expect(vueInit).toHaveBeenCalledTimes(1);
      expect(vueInit).toHaveBeenLastCalledWith(expect.objectContaining(expectedMetadata));
    });
  });
});
