import { BrowserTracing, SDK_VERSION, init } from '@sentry/react';
import type { Integration } from '@sentry/types';

import { init as gatsbyInit } from '../src/sdk';
import type { UserIntegrations } from '../src/utils/integrations';
import type { GatsbyOptions } from '../src/utils/types';

jest.mock('@sentry/react', () => {
  const actual = jest.requireActual('@sentry/react');
  return {
    ...actual,
    init: jest.fn().mockImplementation(actual.init),
  };
});

const reactInit = init as jest.Mock;

describe('Initialize React SDK', () => {
  afterEach(() => reactInit.mockReset());

  test('Has correct SDK metadata', () => {
    gatsbyInit({});
    const calledWith = reactInit.mock.calls[0][0];
    const sdkMetadata = calledWith._metadata.sdk;
    expect(sdkMetadata.name).toStrictEqual('sentry.javascript.gatsby');
    expect(sdkMetadata.version).toBe(SDK_VERSION);
    expect(sdkMetadata.packages).toHaveLength(1); // Only Gatsby SDK
    expect(sdkMetadata.packages[0].name).toStrictEqual('npm:@sentry/gatsby');
    // Explicit tests on the version fail when making new releases
    expect(sdkMetadata.packages[0].version).toBeDefined();
  });

  describe('Environment', () => {
    test('not defined by default', () => {
      gatsbyInit({});
      expect(reactInit).toHaveBeenCalledTimes(1);
      const callingObject = reactInit.mock.calls[0][0];
      expect(callingObject.environment).not.toBeDefined();
    });

    test('defined in the options', () => {
      gatsbyInit({
        environment: 'custom env!',
      });
      expect(reactInit).toHaveBeenCalledTimes(1);
      const callingObject = reactInit.mock.calls[0][0];
      expect(callingObject.environment).toStrictEqual('custom env!');
    });
  });

  test('Has BrowserTracing if tracing enabled', () => {
    gatsbyInit({ tracesSampleRate: 1 });
    expect(reactInit).toHaveBeenCalledTimes(1);
    const calledWith = reactInit.mock.calls[0][0];
    const integrationNames: string[] = calledWith.integrations.map((integration: Integration) => integration.name);
    expect(integrationNames.some(name => name === 'BrowserTracing')).toBe(true);
  });
});

type TestArgs = [string, Integration[], GatsbyOptions, string[]];

describe('Integrations from options', () => {
  afterEach(() => reactInit.mockClear());

  test.each([
    ['tracing disabled, no integrations', [], {}, []],
    ['tracing enabled, no integrations', [], { tracesSampleRate: 1 }, ['BrowserTracing']],
    [
      'tracing disabled, with BrowserTracing as an array',
      [],
      { integrations: [new BrowserTracing()] },
      ['BrowserTracing'],
    ],
    [
      'tracing disabled, with BrowserTracing as a function',
      [],
      {
        integrations: () => [new BrowserTracing()],
      },
      ['BrowserTracing'],
    ],
    [
      'tracing enabled, with BrowserTracing as an array',
      [],
      { tracesSampleRate: 1, integrations: [new BrowserTracing()] },
      ['BrowserTracing'],
    ],
    [
      'tracing enabled, with BrowserTracing as a function',
      [],
      { tracesSampleRate: 1, integrations: () => [new BrowserTracing()] },
      ['BrowserTracing'],
    ],
  ] as TestArgs[])(
    '%s',
    (_testName, defaultIntegrations: Integration[], options: GatsbyOptions, expectedIntNames: string[]) => {
      gatsbyInit(options);
      const integrations: UserIntegrations = reactInit.mock.calls[0][0].integrations;
      const arrIntegrations = Array.isArray(integrations) ? integrations : integrations(defaultIntegrations);
      expect(arrIntegrations).toHaveLength(expectedIntNames.length);
      arrIntegrations.map((integration, idx) => expect(integration.name).toStrictEqual(expectedIntNames[idx]));
    },
  );
});
