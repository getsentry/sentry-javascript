import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  addHandler,
  maybeInstrument,
  resetInstrumentationHandlers,
  triggerHandlers,
} from '../../../src/instrument/handlers';

afterEach(() => {
  resetInstrumentationHandlers();
});

describe('maybeInstrument', () => {
  test('does not throw when instrumenting fails', () => {
    maybeInstrument('xhr', () => {
      throw new Error('test');
    });
  });

  test('does not throw when instrumenting fn is not a function', () => {
    maybeInstrument('xhr', undefined as any);
  });
});

describe('addHandler', () => {
  test('returns an unsubscribe function', () => {
    const handler = vi.fn();
    const unsubscribe = addHandler('fetch', handler);

    expect(typeof unsubscribe).toBe('function');
  });

  test('handler is called when triggerHandlers is invoked', () => {
    const handler = vi.fn();
    addHandler('fetch', handler);

    triggerHandlers('fetch', { url: 'https://example.com' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ url: 'https://example.com' });
  });

  test('unsubscribe removes the handler', () => {
    const handler = vi.fn();
    const unsubscribe = addHandler('fetch', handler);

    triggerHandlers('fetch', { test: 1 });
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();

    triggerHandlers('fetch', { test: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('unsubscribe only removes the specific handler', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const unsubscribe1 = addHandler('fetch', handler1);
    addHandler('fetch', handler2);

    triggerHandlers('fetch', { test: 1 });
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);

    unsubscribe1();

    triggerHandlers('fetch', { test: 2 });
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(2);
  });

  test('calling unsubscribe multiple times is safe', () => {
    const handler = vi.fn();
    const unsubscribe = addHandler('fetch', handler);

    unsubscribe();
    expect(() => unsubscribe()).not.toThrow();
    expect(() => unsubscribe()).not.toThrow();
  });

  test('unsubscribe works with different handler types', () => {
    const consoleHandler = vi.fn();
    const fetchHandler = vi.fn();

    const unsubscribeConsole = addHandler('console', consoleHandler);
    const unsubscribeFetch = addHandler('fetch', fetchHandler);

    triggerHandlers('console', { level: 'log' });
    triggerHandlers('fetch', { url: 'test' });

    expect(consoleHandler).toHaveBeenCalledTimes(1);
    expect(fetchHandler).toHaveBeenCalledTimes(1);

    unsubscribeConsole();

    triggerHandlers('console', { level: 'warn' });
    triggerHandlers('fetch', { url: 'test2' });

    expect(consoleHandler).toHaveBeenCalledTimes(1);
    expect(fetchHandler).toHaveBeenCalledTimes(2);

    unsubscribeFetch();

    triggerHandlers('fetch', { url: 'test3' });
    expect(fetchHandler).toHaveBeenCalledTimes(2);
  });
});
