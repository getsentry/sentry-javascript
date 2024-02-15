/* eslint-disable deprecation/deprecation */
import { BrowserClient, Hub } from '@sentry/browser';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';

import { Transaction, addExtensionMethods } from '../src';
import { getDefaultBrowserClientOptions } from './testutils';

describe('`Transaction` class', () => {
  beforeAll(() => {
    addExtensionMethods();
  });

  describe('transaction name source', () => {
    it('sets source in constructor if provided', () => {
      const transaction = new Transaction({
        name: 'dogpark',
        attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route' },
      });

      expect(transaction.name).toEqual('dogpark');
      expect(transaction.attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toEqual('route');
    });

    it("sets source to be `'custom'` in constructor if not provided", () => {
      const transaction = new Transaction({ name: 'dogpark' });

      expect(transaction.name).toEqual('dogpark');
      expect(transaction.attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toBe('custom');
    });

    it("sets source to `'custom'` when assigning to `name` property", () => {
      const transaction = new Transaction({ name: 'dogpark' });
      transaction.name = 'ballpit';

      expect(transaction.name).toEqual('ballpit');
      expect(transaction.attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toEqual('custom');
    });

    it('sets instrumenter to be `sentry` in constructor if not provided', () => {
      const transaction = new Transaction({ name: 'dogpark' });

      expect(transaction.instrumenter).toEqual('sentry');
    });

    it('allows to set instrumenter', () => {
      const transaction = new Transaction({ name: 'dogpark', instrumenter: 'otel' });

      expect(transaction.instrumenter).toEqual('otel');
    });

    describe('`setName` method', () => {
      it("sets source to `'custom'` if no source provided", () => {
        const transaction = new Transaction({ name: 'dogpark' });
        transaction.setName('ballpit');

        expect(transaction.name).toEqual('ballpit');
        expect(transaction.attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toEqual('custom');
      });

      it('uses given `source` value', () => {
        const transaction = new Transaction({ name: 'dogpark' });
        transaction.setName('ballpit', 'route');

        expect(transaction.name).toEqual('ballpit');
        expect(transaction.attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toEqual('route');
      });
    });

    describe('`updateName` method', () => {
      it('does not change the source', () => {
        const transaction = new Transaction({ name: 'dogpark' });
        transaction.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
        transaction.updateName('ballpit');

        expect(transaction.name).toEqual('ballpit');
        expect(transaction.attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toEqual('route');
      });
    });
  });

  describe('setContext', () => {
    it('sets context', () => {
      const transaction = new Transaction({ name: 'dogpark' });
      transaction.setContext('foo', {
        key: 'val',
        key2: 'val2',
      });

      // @ts-expect-error accessing private property
      expect(transaction._contexts).toEqual({
        foo: {
          key: 'val',
          key2: 'val2',
        },
      });
    });

    it('overwrites context', () => {
      const transaction = new Transaction({ name: 'dogpark' });
      transaction.setContext('foo', {
        key: 'val',
        key2: 'val2',
      });
      transaction.setContext('foo', {
        key3: 'val3',
      });

      // @ts-expect-error accessing private property
      expect(transaction._contexts).toEqual({
        foo: {
          key3: 'val3',
        },
      });
    });

    it('merges context', () => {
      const transaction = new Transaction({ name: 'dogpark' });
      transaction.setContext('foo', {
        key: 'val',
        key2: 'val2',
      });
      transaction.setContext('bar', {
        anotherKey: 'anotherVal',
      });

      // @ts-expect-error accessing private property
      expect(transaction._contexts).toEqual({
        foo: {
          key: 'val',
          key2: 'val2',
        },
        bar: {
          anotherKey: 'anotherVal',
        },
      });
    });

    it('deletes context', () => {
      const transaction = new Transaction({ name: 'dogpark' });
      transaction.setContext('foo', {
        key: 'val',
        key2: 'val2',
      });
      transaction.setContext('foo', null);

      // @ts-expect-error accessing private property
      expect(transaction._contexts).toEqual({});
    });

    it('sets contexts on the event', () => {
      const options = getDefaultBrowserClientOptions({ tracesSampleRate: 1 });
      const client = new BrowserClient(options);
      const hub = new Hub(client);

      jest.spyOn(hub, 'captureEvent');

      const transaction = hub.startTransaction({ name: 'dogpark' });
      transaction.setContext('foo', { key: 'val' });
      transaction.end();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(hub.captureEvent).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(hub.captureEvent).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contexts: {
            foo: { key: 'val' },
            trace: {
              data: {
                [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
              },
              span_id: transaction.spanId,
              trace_id: transaction.traceId,
              origin: 'manual',
            },
          },
        }),
      );
    });

    it('does not override trace context', () => {
      const options = getDefaultBrowserClientOptions({ tracesSampleRate: 1 });
      const client = new BrowserClient(options);
      const hub = new Hub(client);

      jest.spyOn(hub, 'captureEvent');

      const transaction = hub.startTransaction({ name: 'dogpark' });
      transaction.setContext('trace', { key: 'val' });
      transaction.end();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(hub.captureEvent).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(hub.captureEvent).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contexts: {
            trace: {
              data: {
                [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
              },
              span_id: transaction.spanId,
              trace_id: transaction.traceId,
              origin: 'manual',
            },
          },
        }),
      );
    });
  });
});
