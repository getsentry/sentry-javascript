import { RewriteFrames } from '@sentry/integrations';
import { Integration } from '@sentry/types';

import { addIntegration, UserFunctionIntegrations } from '../../src/utils/userIntegrations';

const testIntegration = new RewriteFrames();

describe('user integrations without any integrations', () => {
  test('as an array', () => {
    const userIntegrations: Integration[] = [];
    // Should get a single integration
    let finalIntegrations = addIntegration(testIntegration, userIntegrations);
    expect(finalIntegrations).toBeInstanceOf(Array);
    finalIntegrations = finalIntegrations as Integration[];
    expect(finalIntegrations).toHaveLength(1);
    expect(finalIntegrations[0]).toMatchObject(testIntegration);
  });

  test('as a function', () => {
    const userIntegrationFnc: UserFunctionIntegrations = (): Integration[] => [];
    // Should get a single integration
    const integrationWrapper = addIntegration(testIntegration, userIntegrationFnc);
    expect(integrationWrapper).toBeInstanceOf(Function);
    const finalIntegrations = (integrationWrapper as UserFunctionIntegrations)([]);
    expect(finalIntegrations).toHaveLength(1);
    expect(finalIntegrations[0]).toMatchObject(testIntegration);
  });
});

describe('user integrations with integrations', () => {
  test('as an array', () => {
    const userIntegrations = [new RewriteFrames()];
    // Should get the same array (with no patches)
    const finalIntegrations = addIntegration(testIntegration, userIntegrations);
    expect(finalIntegrations).toMatchObject(userIntegrations);
  });

  test('as a function', () => {
    const userIntegrations = [new RewriteFrames()];
    const integrationsFnc: UserFunctionIntegrations = (_integrations: Integration[]): Integration[] => {
      return userIntegrations;
    };
    // Should get a function that returns the test integration
    let finalIntegrations = addIntegration(testIntegration, integrationsFnc);
    expect(typeof finalIntegrations === 'function').toBe(true);
    expect(finalIntegrations).toBeInstanceOf(Function);
    finalIntegrations = finalIntegrations as UserFunctionIntegrations;
    expect(finalIntegrations([])).toMatchObject(userIntegrations);
  });
});
