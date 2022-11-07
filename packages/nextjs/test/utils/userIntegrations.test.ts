import { RewriteFrames } from '@sentry/integrations';
import { Integration } from '@sentry/types';

import { addOrUpdateIntegration, updateIntegration, UserIntegrationsFunction } from '../../src/utils/userIntegrations';

const testIntegration = new RewriteFrames();

describe('addOrUpdateIntegration()', () => {
  describe('user integrations without any integrations', () => {
    test('as an array', () => {
      const userIntegrations: Integration[] = [];
      // Should get a single integration
      let finalIntegrations = addOrUpdateIntegration(testIntegration, userIntegrations);
      expect(finalIntegrations).toBeInstanceOf(Array);
      finalIntegrations = finalIntegrations as Integration[];
      expect(finalIntegrations).toHaveLength(1);
      expect(finalIntegrations[0]).toMatchObject(testIntegration);
    });

    test('as a function', () => {
      const userIntegrationFnc: UserIntegrationsFunction = (): Integration[] => [];
      // Should get a single integration
      const integrationWrapper = addOrUpdateIntegration(testIntegration, userIntegrationFnc);
      expect(integrationWrapper).toBeInstanceOf(Function);
      const finalIntegrations = (integrationWrapper as UserIntegrationsFunction)([]);
      expect(finalIntegrations).toHaveLength(1);
      expect(finalIntegrations[0]).toMatchObject(testIntegration);
    });
  });

  describe('user integrations with integrations', () => {
    test('as an array', () => {
      const userIntegrations = [new RewriteFrames()];
      // Should get the same array (with no patches)
      const finalIntegrations = addOrUpdateIntegration(testIntegration, userIntegrations);
      expect(finalIntegrations).toMatchObject(userIntegrations);
    });

    test('as a function', () => {
      const userIntegrations = [new RewriteFrames()];
      const integrationsFnc: UserIntegrationsFunction = (_integrations: Integration[]): Integration[] => {
        return userIntegrations;
      };
      // Should get a function that returns the test integration
      let finalIntegrations = addOrUpdateIntegration(testIntegration, integrationsFnc);
      expect(typeof finalIntegrations === 'function').toBe(true);
      expect(finalIntegrations).toBeInstanceOf(Function);
      finalIntegrations = finalIntegrations as UserIntegrationsFunction;
      expect(finalIntegrations([])).toMatchObject(userIntegrations);
    });
  });
});

describe('updateIntegration()', () => {
  describe('integrations function', () => {
    test('should update an integration if it exists', () => {
      const intagration = new RewriteFrames() as any;
      const userIntegrations = [intagration];
      const integrationsFnc: UserIntegrationsFunction = (_integrations: Integration[]): Integration[] => {
        return userIntegrations;
      };
      // Should get a function that returns the test integration
      let finalIntegrations = updateIntegration('RewriteFrames', integrationsFnc, { _option: true });
      expect(typeof finalIntegrations === 'function').toBe(true);
      finalIntegrations = finalIntegrations as UserIntegrationsFunction;
      const evaluatedIntegrations = finalIntegrations([]);
      expect(evaluatedIntegrations).toMatchObject(userIntegrations);
      expect(intagration._option).toBe(true);
    });

    test("should not update an integration if it doesn't exist", () => {
      const intagration = new RewriteFrames() as any;
      const userIntegrations = [intagration];
      const integrationsFnc: UserIntegrationsFunction = (_integrations: Integration[]): Integration[] => {
        return userIntegrations;
      };
      let finalIntegrations = updateIntegration('UncaughtException', integrationsFnc, { _option: true });
      expect(typeof finalIntegrations === 'function').toBe(true);
      finalIntegrations = finalIntegrations as UserIntegrationsFunction;
      const evaluatedIntegrations = finalIntegrations([]);
      expect(evaluatedIntegrations).toMatchObject(userIntegrations);
      expect(intagration._option).not.toBeDefined();
    });
  });

  describe('integrations array', () => {
    test('should update an integration if it exists', () => {
      const intagration = new RewriteFrames() as any;
      const userIntegrations = [intagration];
      const finalIntegrations = updateIntegration('RewriteFrames', userIntegrations, { _option: true });
      expect(finalIntegrations).toBeInstanceOf(Array);
      expect(finalIntegrations).toMatchObject(userIntegrations);
      expect(intagration._option).toBe(true);
    });

    test("should not update an integration if it doesn't exist", () => {
      const intagration = new RewriteFrames() as any;
      const userIntegrations = [intagration];
      const finalIntegrations = updateIntegration('UncaughtException', userIntegrations, { _option: true });
      expect(finalIntegrations).toBeInstanceOf(Array);
      expect(finalIntegrations).toMatchObject(userIntegrations);
      expect(intagration._option).not.toBeDefined();
    });
  });
});
