import { afterEach, describe, expect, it } from 'vitest';
import * as Sentry from '../../../src/light';
import { httpIntegration } from '../../../src/light/integrations/httpIntegration';
import { cleanupLightSdk } from '../../helpers/mockLightSdkInit';

describe('Light Mode | httpIntegration', () => {
  afterEach(() => {
    cleanupLightSdk();
  });

  describe('integration configuration', () => {
    it('has correct integration name', () => {
      const integration = httpIntegration();
      expect(integration.name).toBe('Http');
    });

    it('accepts options', () => {
      const integration = httpIntegration({
        breadcrumbs: false,
        maxRequestBodySize: 'small',
        ignoreOutgoingRequests: (_url: string) => false,
        ignoreRequestBody: (_url: string) => false,
      });

      expect(integration.name).toBe('Http');
    });

    it('has setupOnce method', () => {
      const integration = httpIntegration();
      expect(typeof integration.setupOnce).toBe('function');
    });
  });

  describe('export from light mode', () => {
    it('exports httpIntegration', () => {
      expect(Sentry.httpIntegration).toBeDefined();
      expect(typeof Sentry.httpIntegration).toBe('function');
    });

    it('httpIntegration creates an integration with correct name', () => {
      const integration = Sentry.httpIntegration();
      expect(integration.name).toBe('Http');
    });
  });
});
