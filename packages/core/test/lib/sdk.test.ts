import { Integration } from '@sentry/types';
import { initAndBind } from '../../src/sdk';
import { TestClient } from '../mocks/client';

declare var global: any;

class MockIntegration implements Integration {
  public constructor(name: string) {
    this.name = name;
  }
  public name: string;
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
        new MockIntegration('MockIntegration 1'),
        new MockIntegration('MockIntegration 2'),
      ];
      initAndBind(TestClient, {}, DEFAULT_INTEGRATIONS);
      expect(DEFAULT_INTEGRATIONS[0].handler.mock.calls.length).toBe(1);
      expect(DEFAULT_INTEGRATIONS[1].handler.mock.calls.length).toBe(1);
    });

    test('installs integrations provided through options', () => {
      const integrations: Integration[] = [
        new MockIntegration('MockIntegration 1'),
        new MockIntegration('MockIntegration 2'),
      ];
      initAndBind(TestClient, { integrations }, []);
      expect(integrations[0].handler.mock.calls.length).toBe(1);
      expect(integrations[1].handler.mock.calls.length).toBe(1);
    });

    test('installs merged default integrations, with overrides provided through options', () => {
      const DEFAULT_INTEGRATIONS: Integration[] = [
        new MockIntegration('MockIntegration 1'),
        new MockIntegration('MockIntegration 2'),
      ];
      const integrations: Integration[] = [
        new MockIntegration('MockIntegration 1'),
        new MockIntegration('MockIntegration 3'),
      ];
      initAndBind(TestClient, { integrations }, DEFAULT_INTEGRATIONS);
      // 'MockIntegration 1' should be overridden by the one with the same name provided through options
      expect(DEFAULT_INTEGRATIONS[0].handler.mock.calls.length).toBe(0);
      expect(DEFAULT_INTEGRATIONS[1].handler.mock.calls.length).toBe(1);
      expect(integrations[0].handler.mock.calls.length).toBe(1);
      expect(integrations[1].handler.mock.calls.length).toBe(1);
    });

    test('installs integrations returned from a callback function', () => {
      const DEFAULT_INTEGRATIONS: Integration[] = [
        new MockIntegration('MockIntegration 1'),
        new MockIntegration('MockIntegration 2'),
      ];
      const newIntegration = new MockIntegration('MockIntegration 3');
      initAndBind(
        TestClient,
        {
          // Take only the first one and add a new one to it
          integrations: (integrations: Integration[]) => integrations.slice(0, 1).concat(newIntegration),
        },
        DEFAULT_INTEGRATIONS,
      );
      expect(DEFAULT_INTEGRATIONS[0].handler.mock.calls.length).toBe(1);
      expect(newIntegration.handler.mock.calls.length).toBe(1);
      expect(DEFAULT_INTEGRATIONS[1].handler.mock.calls.length).toBe(0);
    });
  });
});
