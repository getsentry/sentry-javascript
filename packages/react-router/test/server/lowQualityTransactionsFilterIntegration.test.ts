import type { Event, EventType, Integration } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import * as SentryNode from '@sentry/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lowQualityTransactionsFilterIntegration } from '../../src/server/lowQualityTransactionsFilterIntegration';

const loggerLog = vi.spyOn(SentryCore.logger, 'log').mockImplementation(() => {});

describe('Low Quality Transactions Filter Integration', () => {
  afterEach(() => {
    vi.clearAllMocks();
    SentryNode.getGlobalScope().clear();
  });

  describe('integration functionality', () => {
    describe('filters out low quality transactions', () => {
      it.each([
        ['node_modules requests', 'GET /node_modules/some-package/index.js'],
        ['favicon.ico requests', 'GET /favicon.ico'],
        ['@id/ requests', 'GET /@id/some-id']
      ])('%s', (description, transaction) => {
        const integration = lowQualityTransactionsFilterIntegration({ debug: true }) as Integration;
        const event = {
          type: 'transaction' as EventType,
          transaction,
        } as Event;

        const result = integration.processEvent!(event, {}, {} as SentryCore.Client);

        expect(result).toBeNull();

        expect(loggerLog).toHaveBeenCalledWith(
          '[ReactRouter] Filtered node_modules transaction:',
          transaction
        );
      });
    });

    describe('allows high quality transactions', () => {
      it.each([
        ['normal page requests', 'GET /api/users'],
        ['API endpoints', 'POST /data'],
        ['app routes', 'GET /projects/123']
      ])('%s', (description, transaction) => {
        const integration = lowQualityTransactionsFilterIntegration({}) as Integration;
        const event = {
          type: 'transaction' as EventType,
          transaction,
        } as Event;

        const result = integration.processEvent!(event, {}, {} as SentryCore.Client);

        expect(result).toEqual(event);
      });
    });

    it('does not affect non-transaction events', () => {
      const integration = lowQualityTransactionsFilterIntegration({}) as Integration;
      const event = {
        type: 'error' as EventType,
        transaction: 'GET /node_modules/some-package/index.js',
      } as Event;

      const result = integration.processEvent!(event, {}, {} as SentryCore.Client);

      expect(result).toEqual(event);
    });
  });
});
