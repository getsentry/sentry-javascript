import { init as reactInitRaw, SDK_VERSION } from '@sentry/react';
import { Integrations } from '@sentry/tracing';
import { Integration, Package } from '@sentry/types';

import { defaultOptions, init as gatsbyInit } from '../src/sdk';
import { UserIntegrations } from '../src/utils/integrations';
import { GatsbyOptions } from '../src/utils/types';

const reactInit = reactInitRaw as jest.Mock;
jest.mock('@sentry/react');

describe('Initialize React SDK', () => {
  afterEach(() => reactInit.mockReset());

  test('Default init props', () => {
    gatsbyInit({});
    expect(reactInit).toHaveBeenCalledTimes(1);
    const calledWith = reactInit.mock.calls[0][0];
    expect(calledWith).toMatchObject(defaultOptions);
  });

  test('Has correct SDK metadata', () => {
    gatsbyInit({});
    const calledWith = reactInit.mock.calls[0][0];
    const sdkMetadata = calledWith._metadata.sdk;
    expect(sdkMetadata.name).toStrictEqual('sentry.javascript.gatsby');
    expect(sdkMetadata.version).toBe(SDK_VERSION);
    expect(sdkMetadata.packages).toMatchInlineSnapshot(`
      Array [
        Object {
          "name": "npm:@sentry/gatsby",
          "version": "6.13.3",
        },
      ]
    `);
  });

  describe('Environment', () => {
    test('process.env', () => {
      gatsbyInit({});
      expect(reactInit).toHaveBeenCalledTimes(1);
      const callingObject = reactInit.mock.calls[0][0];
      expect(callingObject.environment).toStrictEqual('test');
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

describe('Integrations from options', () => {
  afterEach(() => reactInit.mockClear());

  test.each([
    ['tracing disabled, no integrations', [], {}, []],
    ['tracing enabled, no integrations', [], { tracesSampleRate: 1 }, ['BrowserTracing']],
    [
      'tracing disabled, with Integrations.BrowserTracing as an array',
      [],
      { integrations: [new Integrations.BrowserTracing()] },
      ['BrowserTracing'],
    ],
    [
      'tracing disabled, with Integrations.BrowserTracing as a function',
      [],
      {
        integrations: () => [new Integrations.BrowserTracing()],
      },
      ['BrowserTracing'],
    ],
    [
      'tracing enabled, with Integrations.BrowserTracing as an array',
      [],
      { tracesSampleRate: 1, integrations: [new Integrations.BrowserTracing()] },
      ['BrowserTracing'],
    ],
    [
      'tracing enabled, with Integrations.BrowserTracing as a function',
      [],
      { tracesSampleRate: 1, integrations: () => [new Integrations.BrowserTracing()] },
      ['BrowserTracing'],
    ],
    [
      'tracing enabled, with another integration as an array',
      [],
      { tracesSampleRate: 1, integrations: [new Integrations.Express()] },
      ['Express', 'BrowserTracing'],
    ],
    [
      'tracing enabled, with another integration as a function',
      [],
      { tracesSampleRate: 1, integrations: () => [new Integrations.Express()] },
      ['Express', 'BrowserTracing'],
    ],
    [
      'tracing disabled, with another integration as an array',
      [],
      { integrations: [new Integrations.Express()] },
      ['Express'],
    ],
    [
      'tracing disabled, with another integration as a function',
      [],
      { integrations: () => [new Integrations.Express()] },
      ['Express'],
    ],
    [
      'merges integrations with user integrations as a function',
      [new Integrations.Mongo()],
      {
        tracesSampleRate: 1,
        integrations: (defaultIntegrations: Integration[]): Integration[] => [
          ...defaultIntegrations,
          new Integrations.Express(),
        ],
      },
      ['Mongo', 'Express', 'BrowserTracing'],
    ],
  ])('%s', (_testName, defaultIntegrations: Integration[], options: GatsbyOptions, expectedIntNames: string[]) => {
    gatsbyInit(options);
    const integrations: UserIntegrations = reactInit.mock.calls[0][0].integrations;
    const arrIntegrations = Array.isArray(integrations) ? integrations : integrations(defaultIntegrations);
    expect(arrIntegrations).toHaveLength(expectedIntNames.length);
    arrIntegrations.map((integration, idx) => expect(integration.name).toStrictEqual(expectedIntNames[idx]));
  });
});
