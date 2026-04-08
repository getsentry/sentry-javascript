import { afterEach, describe, expect, it } from 'vitest';
import * as Sentry from '../../../src/light';
import { nativeNodeFetchIntegration } from '../../../src/light/integrations/nativeNodeFetchIntegration';
import { cleanupLightSdk } from '../../helpers/mockLightSdkInit';

describe('Light Mode | nativeNodeFetchIntegration', () => {
  afterEach(() => {
    cleanupLightSdk();
  });

  describe('integration configuration', () => {
    it('has correct integration name', () => {
      const integration = nativeNodeFetchIntegration();
      expect(integration.name).toBe('NodeFetch');
    });

    it('accepts options', () => {
      const integration = nativeNodeFetchIntegration({
        breadcrumbs: false,
        ignoreOutgoingRequests: (_url: string) => false,
      });

      expect(integration.name).toBe('NodeFetch');
    });

    it('has setupOnce method', () => {
      const integration = nativeNodeFetchIntegration();
      expect(typeof integration.setupOnce).toBe('function');
    });
  });

  describe('export from light mode', () => {
    it('exports nativeNodeFetchIntegration', () => {
      expect(Sentry.nativeNodeFetchIntegration).toBeDefined();
      expect(typeof Sentry.nativeNodeFetchIntegration).toBe('function');
    });

    it('nativeNodeFetchIntegration creates an integration with correct name', () => {
      const integration = Sentry.nativeNodeFetchIntegration();
      expect(integration.name).toBe('NodeFetch');
    });
  });
});
