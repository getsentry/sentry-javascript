import type { Mock } from 'vitest';
import { describe, afterEach, expect, vi, test } from 'vitest';

import { SDK_VERSION, init } from '@sentry/react';

import { init as gatsbyInit } from '../src/sdk';

vi.mock('@sentry/react', async requiredActual => {
  const actual = (await requiredActual()) as any;
  return {
    ...actual,
    init: vi.fn().mockImplementation(actual.init),
  };
});

const reactInit = init as Mock;

describe('Initialize React SDK', () => {
  afterEach(() => reactInit.mockReset());

  test('Has correct SDK metadata', () => {
    gatsbyInit({});
    const calledWith = reactInit.mock.calls[0]?.[0];
    const sdkMetadata = calledWith._metadata.sdk;
    expect(sdkMetadata.name).toStrictEqual('sentry.javascript.gatsby');
    expect(sdkMetadata.version).toBe(SDK_VERSION);
    expect(sdkMetadata.packages).toHaveLength(1); // Only Gatsby SDK
    expect(sdkMetadata.packages[0]?.name).toStrictEqual('npm:@sentry/gatsby');
    // Explicit tests on the version fail when making new releases
    expect(sdkMetadata.packages[0]?.version).toBeDefined();
  });

  describe('Environment', () => {
    test('not defined by default', () => {
      gatsbyInit({});
      expect(reactInit).toHaveBeenCalledTimes(1);
      const callingObject = reactInit.mock.calls[0]?.[0];
      expect(callingObject.environment).not.toBeDefined();
    });

    test('defined in the options', () => {
      gatsbyInit({
        environment: 'custom env!',
      });
      expect(reactInit).toHaveBeenCalledTimes(1);
      const callingObject = reactInit.mock.calls[0]?.[0];
      expect(callingObject.environment).toStrictEqual('custom env!');
    });
  });
});
