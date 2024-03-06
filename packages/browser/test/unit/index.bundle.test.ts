import { feedbackIntegrationShim, replayIntegrationShim } from '@sentry-internal/integration-shims';

import * as TracingBundle from '../../src/index.bundle';

describe('index.bundle', () => {
  it('has correct exports', () => {
    Object.keys(TracingBundle.Integrations).forEach(key => {
      expect((TracingBundle.Integrations[key] as any).name).toStrictEqual(expect.any(String));
    });

    expect(TracingBundle.replayIntegration).toBe(replayIntegrationShim);
    expect(TracingBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
  });
});
