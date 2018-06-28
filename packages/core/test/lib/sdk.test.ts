import { Integration } from '@sentry/types';
import { initAndBind } from '../../src/sdk';
import { TestClient } from '../mocks/client';

declare var global: any;

class MockIntegration implements Integration {
  public name: string = 'MockIntegration';
  public handler: () => void = jest.fn();
  public install: () => void = () => {
    this.handler();
  };
}

describe('SDK', () => {
  beforeEach(() => {
    global.__SENTRY__ = {};
  });

  describe('initAndBind', () => {
    test('installs default integrations', () => {
      const DEFAULT_INTEGRATIONS: Integration[] = [
        new MockIntegration(),
        new MockIntegration(),
      ];
      initAndBind(TestClient, {}, DEFAULT_INTEGRATIONS);
      expect(DEFAULT_INTEGRATIONS[0].handler.mock.calls.length).toBe(1);
      expect(DEFAULT_INTEGRATIONS[1].handler.mock.calls.length).toBe(1);
    });

    test('installs integrations provided through options', () => {
      const integrations: Integration[] = [
        new MockIntegration(),
        new MockIntegration(),
      ];
      initAndBind(TestClient, { integrations }, []);
      expect(integrations[0].handler.mock.calls.length).toBe(1);
      expect(integrations[1].handler.mock.calls.length).toBe(1);
    });

    test('installs merged default integrations and one provided through options', () => {
      const DEFAULT_INTEGRATIONS: Integration[] = [
        new MockIntegration(),
        new MockIntegration(),
      ];
      const integrations: Integration[] = [
        new MockIntegration(),
        new MockIntegration(),
      ];
      initAndBind(TestClient, { integrations }, DEFAULT_INTEGRATIONS);
      expect(DEFAULT_INTEGRATIONS[0].handler.mock.calls.length).toBe(1);
      expect(DEFAULT_INTEGRATIONS[1].handler.mock.calls.length).toBe(1);
      expect(integrations[0].handler.mock.calls.length).toBe(1);
      expect(integrations[1].handler.mock.calls.length).toBe(1);
    });

    test('installs integrations returned from a callback function', () => {
      const DEFAULT_INTEGRATIONS: Integration[] = [
        new MockIntegration(),
        new MockIntegration(),
      ];
      const newIntegration = new MockIntegration();
      initAndBind(
        TestClient,
        {
          // Take only the first one and add a new one to it
          integrations: (integrations: Integration[]) =>
            integrations.slice(0, 1).concat(newIntegration),
        },
        DEFAULT_INTEGRATIONS,
      );
      expect(DEFAULT_INTEGRATIONS[0].handler.mock.calls.length).toBe(1);
      expect(newIntegration.handler.mock.calls.length).toBe(1);
      expect(DEFAULT_INTEGRATIONS[1].handler.mock.calls.length).toBe(0);
    });
  });
});
