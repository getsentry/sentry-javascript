import { init as reactInitRaw } from '@sentry/react';
import { Integrations } from '@sentry/tracing';
import { Integration } from '@sentry/types';

import { defaultOptions, init as gatsbyInit } from '../src/sdk';
import { GatsbyOptions } from '../src/utils/types';

const reactInit = reactInitRaw as jest.Mock;
jest.mock('@sentry/react');

describe('Initialize React SDK', () => {
  afterEach(() => {
    reactInit.mockReset();
  });

  test('Default init props', () => {
    gatsbyInit({});
    expect(reactInit).toHaveBeenCalledTimes(1);
    const calledWith = reactInit.mock.calls[0][0];
    expect(calledWith).toMatchObject(defaultOptions);
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
    ['tracing disabled, no integrations', {}, []],
    ['tracing enabled, no integrations', { tracesSampleRate: 1 }, ['BrowserTracing']],
    [
      'tracing disabled, with Integrations.BrowserTracing',
      { integrations: [new Integrations.BrowserTracing()] },
      ['BrowserTracing'],
    ],
    [
      'tracing enabled, with Integrations.BrowserTracing',
      { tracesSampleRate: 1, integrations: [new Integrations.BrowserTracing()] },
      ['BrowserTracing'],
    ],
    [
      'tracing enabled, with another integration',
      { tracesSampleRate: 1, integrations: [new Integrations.Express()] },
      ['Express', 'BrowserTracing'],
    ],
    ['tracing disabled, with another integration', { integrations: [new Integrations.Express()] }, ['Express']],
  ])('%s', (_testName, options: GatsbyOptions, expectedIntNames: string[]) => {
    gatsbyInit(options);
    const integrations: Integration[] = reactInit.mock.calls[0][0].integrations;
    expect(integrations).toHaveLength(expectedIntNames.length);
    integrations.map((integration, idx) => expect(integration.name).toStrictEqual(expectedIntNames[idx]));
  });
});
