import { ROOT_CONTEXT } from '@opentelemetry/api';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { SentryAsyncLocalStorageContextManager } from '../../src/opentelemetry/asyncLocalStorageContextManager';
import { AsyncLocalStorage } from 'node:async_hooks';

describe('SentryAsyncLocalStorageContextManager', () => {
  describe('disable', () => {
    it('disables the underlying async local storage', () => {
      const contextManager = new SentryAsyncLocalStorageContextManager(new AsyncLocalStorage());
      const disable = vi.spyOn(contextManager['_asyncLocalStorage'], 'disable');

      expect(contextManager.disable()).toBe(contextManager);
      expect(disable).toHaveBeenCalledTimes(1);
    });

    // Cloudflare Workers' `nodejs_compat` AsyncLocalStorage does not implement `disable()`
    it('does not throw when the async local storage has no disable method', () => {
      const contextManager = new SentryAsyncLocalStorageContextManager(new AsyncLocalStorage());
      // @ts-expect-error -- simulating a runtime that omits `disable`
      contextManager['_asyncLocalStorage'].disable = undefined;

      expect(() => contextManager.disable()).not.toThrow();
    });
  });

  describe('bind', () => {
    it('binds functions', () => {
      const contextManager = new SentryAsyncLocalStorageContextManager(new AsyncLocalStorage());
      const context = ROOT_CONTEXT.setValue(Symbol.for('test'), 'value');

      const fn = vi.fn((a: number, b: number) => a + b);
      const bound = contextManager.bind(context, fn);

      expect(bound).not.toBe(fn);
      expect(bound.length).toBe(2);
      expect(bound(1, 2)).toBe(3);
    });

    it('patches event emitters and runs listeners in the bound context', () => {
      const contextManager = new SentryAsyncLocalStorageContextManager(new AsyncLocalStorage());
      const key = Symbol.for('test');
      const context = ROOT_CONTEXT.setValue(key, 'value');

      const ee = new EventEmitter();
      expect(contextManager.bind(context, ee)).toBe(ee);

      const seen: unknown[] = [];
      ee.on('foo', () => {
        seen.push(contextManager.active().getValue(key));
      });
      ee.emit('foo');

      expect(seen).toEqual(['value']);
    });

    it('removes patched listeners via removeListener', () => {
      const contextManager = new SentryAsyncLocalStorageContextManager(new AsyncLocalStorage());
      const ee = contextManager.bind(ROOT_CONTEXT, new EventEmitter());

      const listener = vi.fn();
      ee.on('foo', listener);
      ee.removeListener('foo', listener);
      ee.emit('foo');

      expect(listener).not.toHaveBeenCalled();
      expect(ee.listenerCount('foo')).toBe(0);
    });

    // These objects have an `on` property, so a presence-only check would treat them as emitters and
    // later invoke a non-function as the original method.
    it.each([
      ['boolean on', { on: true }],
      ['string on', { on: 'yes' }],
      ['numeric on', { on: 1 }],
      ['object on', { on: {} }],
      ['null on', { on: null }],
      ['function on but no emit', { on: () => {} }],
      ['emit but no on', { emit: () => {} }],
      ['plain object', {}],
    ])('returns non-emitter target untouched: %s', (_name, target) => {
      const contextManager = new SentryAsyncLocalStorageContextManager(new AsyncLocalStorage());
      const snapshot = { ...target };

      const result = contextManager.bind(ROOT_CONTEXT, target);

      expect(result).toBe(target);
      expect({ ...target }).toEqual(snapshot);
      // No patch map symbol was attached
      expect(Object.getOwnPropertySymbols(target)).toEqual([]);
    });

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['number', 42],
      ['string', 'foo'],
      ['boolean', true],
      ['array', [1, 2, 3]],
    ])('returns primitive target untouched: %s', (_name, target) => {
      const contextManager = new SentryAsyncLocalStorageContextManager(new AsyncLocalStorage());

      expect(contextManager.bind(ROOT_CONTEXT, target)).toBe(target);
    });

    it('does not call a non-function `on` when the object also has a callable emit', () => {
      const contextManager = new SentryAsyncLocalStorageContextManager(new AsyncLocalStorage());
      // `on` is not callable – patching and later invoking it would throw
      const target = { on: 'not-a-function', emit: () => {} };

      contextManager.bind(ROOT_CONTEXT, target);

      expect(target.on).toBe('not-a-function');
    });

    it('does not throw for frozen event emitters', () => {
      const contextManager = new SentryAsyncLocalStorageContextManager(new AsyncLocalStorage());
      const ee = Object.freeze(new EventEmitter());

      expect(() => contextManager.bind(ROOT_CONTEXT, ee)).not.toThrow();
      expect(ee.on).toBe(EventEmitter.prototype.on);
    });

    it('does not throw for frozen emitter-like objects and leaves them functional', () => {
      const contextManager = new SentryAsyncLocalStorageContextManager(new AsyncLocalStorage());
      const listeners: Array<(...args: unknown[]) => unknown> = [];
      const originalOn = (_event: string, listener: (...args: unknown[]) => unknown): void => {
        listeners.push(listener);
      };
      const target = Object.freeze({
        on: originalOn,
        emit: (_event: string) => listeners.forEach(listener => listener()),
      });

      expect(() => contextManager.bind(ROOT_CONTEXT, target)).not.toThrow();
      expect(target.on).toBe(originalOn);

      const listener = vi.fn();
      target.on('foo', listener);
      target.emit('foo');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('does not throw for sealed event emitters', () => {
      const contextManager = new SentryAsyncLocalStorageContextManager(new AsyncLocalStorage());
      const ee = Object.seal(new EventEmitter());

      expect(() => contextManager.bind(ROOT_CONTEXT, ee)).not.toThrow();

      const listener = vi.fn();
      ee.on('foo', listener);
      ee.emit('foo');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('does not throw for emitters with getter-only methods', () => {
      const contextManager = new SentryAsyncLocalStorageContextManager(new AsyncLocalStorage());
      const ee = new EventEmitter();
      const originalOn = ee.on.bind(ee);
      Object.defineProperty(ee, 'on', {
        configurable: false,
        get: () => originalOn,
      });

      expect(() => contextManager.bind(ROOT_CONTEXT, ee)).not.toThrow();

      const listener = vi.fn();
      ee.on('foo', listener);
      ee.emit('foo');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('patches emitter-like objects that are not EventEmitter instances', () => {
      const contextManager = new SentryAsyncLocalStorageContextManager(new AsyncLocalStorage());
      const key = Symbol.for('test');
      const context = ROOT_CONTEXT.setValue(key, 'value');

      const listeners: Array<(...args: unknown[]) => unknown> = [];
      const target = {
        on(_event: string, listener: (...args: unknown[]) => unknown) {
          listeners.push(listener);
          return this;
        },
        emit(_event: string) {
          listeners.forEach(listener => listener());
          return true;
        },
      };

      contextManager.bind(context, target);

      const seen: unknown[] = [];
      target.on('foo', () => {
        seen.push(contextManager.active().getValue(key));
      });
      target.emit('foo');

      expect(seen).toEqual(['value']);
    });

    it('leaves absent listener methods absent', () => {
      const contextManager = new SentryAsyncLocalStorageContextManager(new AsyncLocalStorage());
      const target = { on: () => {}, emit: () => {} };

      contextManager.bind(ROOT_CONTEXT, target);

      expect('once' in target).toBe(false);
      expect('removeListener' in target).toBe(false);
      expect('removeAllListeners' in target).toBe(false);
    });

    it('does not patch the same emitter twice', () => {
      const contextManager = new SentryAsyncLocalStorageContextManager(new AsyncLocalStorage());
      const ee = new EventEmitter();

      contextManager.bind(ROOT_CONTEXT, ee);
      const patchedOn = ee.on;

      contextManager.bind(ROOT_CONTEXT, ee);
      expect(ee.on).toBe(patchedOn);
    });
  });
});
