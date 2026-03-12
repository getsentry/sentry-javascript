import { describe, expect, it } from 'vitest';
import { _getConfigWithDefaults } from '../../src/integrations/node-fetch';

describe('nativeNodeFetchIntegration', () => {
  describe('_getConfigWithDefaults', () => {
    it('passes headersToSpanAttributes through to the config', () => {
      const config = _getConfigWithDefaults({
        headersToSpanAttributes: {
          requestHeaders: ['x-custom-header'],
          responseHeaders: ['content-length', 'content-type'],
        },
      });

      expect(config.headersToSpanAttributes).toEqual({
        requestHeaders: ['x-custom-header'],
        responseHeaders: ['content-length', 'content-type'],
      });
    });

    it('does not set headersToSpanAttributes when not provided', () => {
      const config = _getConfigWithDefaults({});
      expect(config.headersToSpanAttributes).toBeUndefined();
    });
  });
});
