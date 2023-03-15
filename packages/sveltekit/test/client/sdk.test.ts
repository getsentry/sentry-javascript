import { getCurrentHub } from '@sentry/core';
import * as SentrySvelte from '@sentry/svelte';
import { SDK_VERSION, WINDOW } from '@sentry/svelte';
import { vi } from 'vitest';

import { init } from '../../src/client/sdk';

const svelteInit = vi.spyOn(SentrySvelte, 'init');

describe('Sentry client SDK', () => {
  describe('init', () => {
    afterEach(() => {
      vi.clearAllMocks();
      WINDOW.__SENTRY__.hub = undefined;
    });

    it('adds SvelteKit metadata to the SDK options', () => {
      expect(svelteInit).not.toHaveBeenCalled();

      init({});

      expect(svelteInit).toHaveBeenCalledTimes(1);
      expect(svelteInit).toHaveBeenCalledWith(
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

    it('sets the runtime tag on the scope', () => {
      const currentScope = getCurrentHub().getScope();

      // @ts-ignore need access to protected _tags attribute
      expect(currentScope._tags).toEqual({});

      init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      // @ts-ignore need access to protected _tags attribute
      expect(currentScope._tags).toEqual({ runtime: 'browser' });
    });
  });
});
