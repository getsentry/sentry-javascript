import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, test, vi } from 'vitest';
import { CloudflareClient } from '../src/client';
import { getDefaultIntegrations, init } from '../src/sdk';
import { resetSdk } from './testUtils';

describe('init', () => {
  beforeEach(() => {
    resetSdk();
  });

  test('should call initAndBind with the correct options', () => {
    const initAndBindSpy = vi.spyOn(SentryCore, 'initAndBind');
    const client = init({});

    expect(initAndBindSpy).toHaveBeenCalledWith(CloudflareClient, expect.any(Object));

    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(CloudflareClient);
  });

  describe('getDefaultIntegrations', () => {
    it('returns list of integrations with default options', () => {
      const integrations = getDefaultIntegrations({}).map(integration => integration.name);
      expect(integrations).toEqual([
        'Dedupe',
        'InboundFilters',
        'FunctionToString',
        'LinkedErrors',
        'Fetch',
        'Hono',
        'RequestData',
        'Console',
      ]);
    });

    it('adds dedupeIntegration if enableDedupe is true', () => {
      const integrations = getDefaultIntegrations({ enableDedupe: true }).map(integration => integration.name);
      expect(integrations).toEqual([
        'Dedupe',
        'InboundFilters',
        'FunctionToString',
        'LinkedErrors',
        'Fetch',
        'Hono',
        'RequestData',
        'Console',
      ]);
    });

    it('adds spanStreamingIntegration if traceLifecycle is stream', () => {
      const integrations = getDefaultIntegrations({ traceLifecycle: 'stream' }).map(integration => integration.name);
      expect(integrations).toEqual([
        'Dedupe',
        'InboundFilters',
        'FunctionToString',
        'LinkedErrors',
        'Fetch',
        'Hono',
        'RequestData',
        'Console',
        'SpanStreaming',
      ]);
    });

    it('intializes requestDataIntegration to not include cookies if sendDefaultPii is false', () => {
      const reqDataIntegrationSpy = vi.spyOn(SentryCore, 'requestDataIntegration');

      getDefaultIntegrations({ sendDefaultPii: false }).map(integration => integration.name);

      expect(reqDataIntegrationSpy).toHaveBeenCalledWith({ include: { cookies: false } });
    });

    it('intializes requestDataIntegration to include cookies if sendDefaultPii is true', () => {
      const reqDataIntegrationSpy = vi.spyOn(SentryCore, 'requestDataIntegration');

      getDefaultIntegrations({ sendDefaultPii: true }).map(integration => integration.name);

      expect(reqDataIntegrationSpy).toHaveBeenCalledWith(undefined);
    });
  });
});
