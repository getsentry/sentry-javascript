import { Integration } from '@sentry/types';

import { init } from '../src/sdk';
import * as sdk from '../src/sdk';

// eslint-disable-next-line no-var
declare var global: any;

const PUBLIC_DSN = 'https://username@domain/123';

class MockIntegration implements Integration {
  public name: string;
  public setupOnce: jest.Mock = jest.fn();
  public constructor(name: string) {
    this.name = name;
  }
}

const defaultIntegrationsBackup = sdk.defaultIntegrations;

describe('init()', () => {
  beforeEach(() => {
    global.__SENTRY__ = {};
  });

  afterEach(() => {
    // @ts-ignore - Reset the default integrations of node sdk to original
    sdk.defaultIntegrations = defaultIntegrationsBackup;
  });

  it("doesn't install default integrations if told not to", () => {
    const mockDefaultIntegrations = [
      new MockIntegration('Mock integration 1.1'),
      new MockIntegration('Mock integration 1.2'),
    ];

    // @ts-ignore - Replace default integrations with mock integrations, needs ts-ignore because imports are readonly
    sdk.defaultIntegrations = mockDefaultIntegrations;

    init({ dsn: PUBLIC_DSN, defaultIntegrations: false });

    expect(mockDefaultIntegrations[0].setupOnce as jest.Mock).toHaveBeenCalledTimes(0);
    expect(mockDefaultIntegrations[1].setupOnce as jest.Mock).toHaveBeenCalledTimes(0);
  });

  it('installs merged default integrations, with overrides provided through options', () => {
    const mockDefaultIntegrations = [
      new MockIntegration('Some mock integration 2.1'),
      new MockIntegration('Some mock integration 2.2'),
    ];

    // @ts-ignore - Replace default integrations with mock integrations, needs ts-ignore because imports are readonly
    sdk.defaultIntegrations = mockDefaultIntegrations;

    const mockIntegrations = [
      new MockIntegration('Some mock integration 2.1'),
      new MockIntegration('Some mock integration 2.3'),
    ];

    init({ dsn: PUBLIC_DSN, integrations: mockIntegrations });

    expect(mockDefaultIntegrations[0].setupOnce as jest.Mock).toHaveBeenCalledTimes(0);
    expect(mockDefaultIntegrations[1].setupOnce as jest.Mock).toHaveBeenCalledTimes(1);
    expect(mockIntegrations[0].setupOnce as jest.Mock).toHaveBeenCalledTimes(1);
    expect(mockIntegrations[1].setupOnce as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it('installs integrations returned from a callback function', () => {
    const mockDefaultIntegrations = [
      new MockIntegration('Some mock integration 3.1'),
      new MockIntegration('Some mock integration 3.2'),
    ];

    // @ts-ignore - Replace default integrations with mock integrations, needs ts-ignore because imports are readonly
    sdk.defaultIntegrations = mockDefaultIntegrations;

    const newIntegration = new MockIntegration('Some mock integration 3.3');

    init({
      dsn: PUBLIC_DSN,
      integrations: integrations => {
        const newIntegrations = [...integrations];
        newIntegrations[1] = newIntegration;
        return newIntegrations;
      },
    });

    expect(mockDefaultIntegrations[0].setupOnce as jest.Mock).toHaveBeenCalledTimes(1);
    expect(mockDefaultIntegrations[1].setupOnce as jest.Mock).toHaveBeenCalledTimes(0);
    expect(newIntegration.setupOnce as jest.Mock).toHaveBeenCalledTimes(1);
  });
});
