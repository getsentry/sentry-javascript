import type { EventProcessor } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { SDK_VERSION } from '@sentry/node';
import * as SentryNode from '@sentry/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { init as vinextInit } from '../../src/server';

const nodeInit = vi.spyOn(SentryNode, 'init');

describe('Vinext Server SDK init', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure no client is initialized for the next test
    vi.spyOn(SentryCore, 'getClient').mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has the correct metadata', () => {
    const client = vinextInit({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    });

    const expectedMetadata = {
      _metadata: {
        sdk: {
          name: 'sentry.javascript.vinext',
          packages: [
            { name: 'npm:@sentry/vinext', version: SDK_VERSION },
            { name: 'npm:@sentry/node', version: SDK_VERSION },
          ],
          version: SDK_VERSION,
        },
      },
    };

    expect(client).not.toBeUndefined();
    expect(nodeInit).toHaveBeenCalledTimes(1);
    expect(nodeInit).toHaveBeenLastCalledWith(expect.objectContaining(expectedMetadata));
  });

  it('registers event processors', () => {
    const passedEventProcessors: EventProcessor[] = [];
    vi.spyOn(SentryCore, 'getGlobalScope').mockReturnValue({
      addEventProcessor: (ep: EventProcessor) => {
        passedEventProcessors.push(ep);
        return {} as any;
      },
    } as any);

    vinextInit({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    });

    expect(passedEventProcessors.length).toBe(2);
    expect(passedEventProcessors[0]?.id).toEqual('VinextLowQualityTransactionsFilter');
    expect(passedEventProcessors[1]?.id).toEqual('VinextDropReactControlFlowErrors');
  });

  describe('VinextLowQualityTransactionsFilter', () => {
    function getFilter(): EventProcessor {
      const passedEventProcessors: EventProcessor[] = [];
      vi.spyOn(SentryCore, 'getGlobalScope').mockReturnValue({
        addEventProcessor: (ep: EventProcessor) => {
          passedEventProcessors.push(ep);
          return {} as any;
        },
      } as any);

      vinextInit({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      const filter = passedEventProcessors.find(ep => ep.id === 'VinextLowQualityTransactionsFilter');
      expect(filter).toBeDefined();
      return filter!;
    }

    it('filters __vinext internal transactions', () => {
      const filter = getFilter();
      expect(filter({ type: 'transaction', transaction: 'GET /__vinext/image' }, {})).toBeNull();
    });

    it('filters 404 transactions', () => {
      const filter = getFilter();
      expect(filter({ type: 'transaction', transaction: '/404' }, {})).toBeNull();
      expect(filter({ type: 'transaction', transaction: 'GET /404' }, {})).toBeNull();
      expect(filter({ type: 'transaction', transaction: 'GET /_not-found' }, {})).toBeNull();
    });

    it('keeps valid transactions', () => {
      const filter = getFilter();
      const event = { type: 'transaction' as const, transaction: 'GET /api/users' };
      expect(filter(event, {})).toEqual(event);
    });
  });

  describe('VinextDropReactControlFlowErrors', () => {
    function getFilter(): EventProcessor {
      const passedEventProcessors: EventProcessor[] = [];
      vi.spyOn(SentryCore, 'getGlobalScope').mockReturnValue({
        addEventProcessor: (ep: EventProcessor) => {
          passedEventProcessors.push(ep);
          return {} as any;
        },
      } as any);

      vinextInit({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      const filter = passedEventProcessors.find(ep => ep.id === 'VinextDropReactControlFlowErrors');
      expect(filter).toBeDefined();
      return filter!;
    }

    it('filters React Suspense errors', () => {
      const filter = getFilter();
      const event = {
        exception: {
          values: [{ value: 'Suspense Exception: This is not a real error!' }],
        },
      };
      expect(filter(event, {})).toBeNull();
    });

    it('filters React postpone errors', () => {
      const filter = getFilter();
      const postponeError = { $$typeof: Symbol.for('react.postpone') };
      expect(filter({}, { originalException: postponeError })).toBeNull();
    });

    it('keeps real errors', () => {
      const filter = getFilter();
      const event = {
        exception: {
          values: [{ value: 'TypeError: Cannot read property of undefined' }],
        },
      };
      expect(filter(event, { originalException: new Error('real error') })).toEqual(event);
    });
  });
});
