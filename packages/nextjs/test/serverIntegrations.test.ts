import { RewriteFrames } from '@sentry/integrations';
import { Integration } from '@sentry/types';

import { defaultRewriteFrames, getFinalServerIntegrations } from '../src/utils/serverIntegrations';

interface IntegrationFunction {
  (integrations: Integration[]): Integration[];
}

describe('integrations without RewriteFrames', () => {
  test('as an array', () => {
    const integrations: Integration[] = [];
    // Should get a single integration: RewriteFrames
    let finalIntegrations = getFinalServerIntegrations(integrations);
    expect(Array.isArray(finalIntegrations)).toBeTruthy();
    finalIntegrations = finalIntegrations as Integration[];
    expect(finalIntegrations.length === 1).toBeTruthy();
    expect(finalIntegrations[0]).toMatchObject(defaultRewriteFrames);
  });

  test('as a function', () => {
    const integrations: IntegrationFunction = (): Integration[] => {
      return [];
    };
    // Should get a single integration: RewriteFrames
    const integrationWrapper = getFinalServerIntegrations(integrations);
    expect(typeof integrationWrapper === 'function').toBeTruthy();
    const finalIntegrations = (integrationWrapper as IntegrationFunction)([]);
    expect(finalIntegrations.length === 1).toBeTruthy();
    expect(finalIntegrations[0]).toMatchObject(defaultRewriteFrames);
  });
});

describe('integrations with RewriteFrames', () => {
  test('as an array', () => {
    const rewriteFramesIntegration = new RewriteFrames();
    const integrations = [rewriteFramesIntegration];
    // Should get the same array (with no patches)
    const finalIntegrations = getFinalServerIntegrations(integrations);
    expect(finalIntegrations).toMatchObject(integrations);
  });

  test('as a function', () => {
    const integrations = [new RewriteFrames()];
    const integrationsFnc: IntegrationFunction = (_integrations: Integration[]): Integration[] => {
      return integrations;
    };
    // Should get a function that returns the RewriteFramesIntegration
    let finalIntegrations = getFinalServerIntegrations(integrationsFnc);
    expect(typeof finalIntegrations === 'function').toBeTruthy();
    finalIntegrations = finalIntegrations as IntegrationFunction;
    expect(finalIntegrations([])).toMatchObject(integrations);
  });
});
