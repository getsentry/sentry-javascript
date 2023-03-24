/* eslint-disable deprecation/deprecation */
import { BrowserClient, Hub } from '@sentry/browser';

import { addExtensionMethods, Transaction } from '../src';
import { getDefaultBrowserClientOptions } from './testutils';

describe('`Transaction` class', () => {
  beforeAll(() => {
    addExtensionMethods();
  });

  describe('transaction name source', () => {
    it('sets source in constructor if provided', () => {
      const transaction = new Transaction({ name: 'dogpark', metadata: { source: 'route' } });

      expect(transaction.name).toEqual('dogpark');
      expect(transaction.metadata.source).toEqual('route');
    });

    it("sets source to be `'custom'` in constructor if not provided", () => {
      const transaction = new Transaction({ name: 'dogpark' });

      expect(transaction.name).toEqual('dogpark');
      expect(transaction.metadata.source).toBe('custom');
    });

    it("sets source to `'custom'` when assigning to `name` property", () => {
      const transaction = new Transaction({ name: 'dogpark' });
      transaction.name = 'ballpit';

      expect(transaction.name).toEqual('ballpit');
      expect(transaction.metadata.source).toEqual('custom');
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
        expect(transaction.metadata.source).toEqual('custom');
      });

      it('uses given `source` value', () => {
        const transaction = new Transaction({ name: 'dogpark' });
        transaction.setName('ballpit', 'route');

        expect(transaction.name).toEqual('ballpit');
        expect(transaction.metadata.source).toEqual('route');
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

      // @ts-ignore accessing private property
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

      // @ts-ignore accessing private property
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

      // @ts-ignore accessing private property
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

      // @ts-ignore accessing private property
      expect(transaction._contexts).toEqual({});
    });

    it('sets contexts on the event', () => {
      const options = getDefaultBrowserClientOptions({ tracesSampleRate: 1 });
      const client = new BrowserClient(options);
      const hub = new Hub(client);

      jest.spyOn(hub, 'captureEvent');

      const transaction = hub.startTransaction({ name: 'dogpark' });
      transaction.setContext('foo', { key: 'val' });
      transaction.finish();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(hub.captureEvent).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(hub.captureEvent).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contexts: {
            foo: { key: 'val' },
            trace: {
              span_id: transaction.spanId,
              trace_id: transaction.traceId,
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
      transaction.finish();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(hub.captureEvent).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(hub.captureEvent).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contexts: {
            trace: {
              span_id: transaction.spanId,
              trace_id: transaction.traceId,
            },
          },
        }),
      );
    });
  });
});
