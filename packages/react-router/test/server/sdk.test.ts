import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getGlobalScope } from '@sentry/core';
import type { Event, EventType } from '@sentry/core';
import * as SentryNode from '@sentry/node';
import type { NodeClient } from '@sentry/node';
import { SDK_VERSION } from '@sentry/node';

import { init as reactRouterInit, lowQualityTransactionsFilter } from '../../src/server/sdk';

const nodeInit = vi.spyOn(SentryNode, 'init');

describe('React Router server SDK', () => {
  describe('init', () => {
    afterEach(() => {
      vi.clearAllMocks();

      SentryNode.getGlobalScope().clear();
      SentryNode.getIsolationScope().clear();
      SentryNode.getCurrentScope().clear();
      SentryNode.getCurrentScope().setClient(undefined);
    });

    it('adds React Router metadata to the SDK options', () => {
      expect(nodeInit).not.toHaveBeenCalled();

      reactRouterInit({});

      expect(nodeInit).toHaveBeenCalledTimes(1);
      expect(nodeInit).toHaveBeenCalledWith(
        expect.objectContaining({
          _metadata: {
            sdk: {
              name: 'sentry.javascript.react-router',
              version: SDK_VERSION,
              packages: [
                { name: 'npm:@sentry/react-router', version: SDK_VERSION },
                { name: 'npm:@sentry/node', version: SDK_VERSION },
              ],
            },
          },
        }),
      );
    });

    it('returns client from init', () => {
      const client = reactRouterInit({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      }) as NodeClient;
      expect(client).not.toBeUndefined();
    });

    it('registers the low quality transactions filter', async () => {
      const addEventProcessor = vi.spyOn(getGlobalScope(), 'addEventProcessor');
      addEventProcessor.mockClear();

      reactRouterInit({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      }) as NodeClient;

      expect(addEventProcessor).toHaveBeenCalledTimes(1);
      const processor = addEventProcessor.mock.calls[0]![0];
      expect(processor?.id).toEqual('ReactRouterLowQualityTransactionsFilter');
    });

    describe('transaction filtering', () => {
      const beforeSendEvent = vi.fn(event => event);
      let client: NodeClient;

      beforeEach(() => {
        vi.clearAllMocks();
        beforeSendEvent.mockClear();
        SentryNode.getGlobalScope().clear();

        client = reactRouterInit({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
        }) as NodeClient;

        client.on('beforeSendEvent', beforeSendEvent);
      });

      describe('filters out low quality transactions', () => {
        it.each(['GET /node_modules/react/index.js', 'GET /favicon.ico', 'GET /@id/package'])(
          '%s',
          async transaction => {
            client.captureEvent({ type: 'transaction', transaction });

            await client.flush();

            expect(beforeSendEvent).not.toHaveBeenCalled();
          },
        );
      });

      describe('allows high quality transactions', () => {
        it.each(['GET /', 'GET /users', 'POST /api/data', 'GET /projects/123'])('%s', async transaction => {
          client.captureEvent({ type: 'transaction', transaction });

          await client.flush();

          expect(beforeSendEvent).toHaveBeenCalledWith(expect.objectContaining({ transaction }), expect.any(Object));
        });
      });
    });
  });

  describe('lowQualityTransactionsFilter', () => {
    describe('filters out low quality transactions', () => {
      it.each([
        ['node_modules request', 'GET /node_modules/react/index.js'],
        ['favicon.ico request', 'GET /favicon.ico'],
        ['@id request', 'GET /@id/package'],
      ])('%s', (description, transaction) => {
        const filter = lowQualityTransactionsFilter({});
        const event = {
          type: 'transaction' as EventType,
          transaction,
        } as Event;

        expect(filter(event, {})).toBeNull();
      });
    });

    describe('does not filter good transactions', () => {
      it.each([
        ['normal page request', 'GET /users'],
        ['API request', 'POST /api/users'],
        ['app route', 'GET /projects/123'],
      ])('%s', (description, transaction) => {
        const filter = lowQualityTransactionsFilter({});
        const event = {
          type: 'transaction' as EventType,
          transaction,
        } as Event;

        expect(filter(event, {})).toBe(event);
      });
    });
  });
});
