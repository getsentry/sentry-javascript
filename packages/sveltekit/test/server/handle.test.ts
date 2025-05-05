import * as NodeSDK from '@sentry/node';
import { describe, expect, it, vi } from 'vitest';
import { initCloudflareSentryHandle, sentryHandle } from '../../src/server';

describe('Node handle hooks', () => {
  // dumb test to ensure we continue exporting the request handlers
  it('should export all handlers from the Node SDK entry point', () => {
    expect(sentryHandle).toBeDefined();
    expect(initCloudflareSentryHandle).toBeDefined();
  });

  describe('initCloudflareSentryHandle', () => {
    it('inits Sentry on the first call but not on subsequent calls', async () => {
      // @ts-expect-error - no need for an actual init call
      vi.spyOn(NodeSDK, 'init').mockImplementationOnce(() => {});

      const handle = initCloudflareSentryHandle({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });
      expect(handle).toBeDefined();

      // @ts-expect-error - no need to call with actual params
      await handle({ event: {}, resolve: () => Promise.resolve({}) });

      expect(NodeSDK.init).toHaveBeenCalledTimes(1);

      // @ts-expect-error - no need to call with actual params
      await handle({ event: {}, resolve: () => Promise.resolve({}) });

      expect(NodeSDK.init).toHaveBeenCalledTimes(1);
    });
  });
});
