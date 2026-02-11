import { describe, expect, it, vi } from 'vitest';
import { handleCallbackErrors } from '../../../src/utils/handleCallbackErrors';

describe('handleCallbackErrors - Proxy for thenable objects', () => {
  it('preserves extra methods on thenable objects (jQuery jqXHR use case)', async () => {
    const onError = vi.fn();
    const onFinally = vi.fn();

    // Mock a JQuery jqXHR-like object with both Promise and XHR methods
    let resolvePromise: (value: unknown) => void;
    const promise = new Promise(resolve => {
      resolvePromise = resolve;
    });

    const mockJqXHR = {
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
      abort: vi.fn(() => 'abort-successful'),
      status: 0,
      readyState: 1,
      responseText: '',
    };

    const fn = vi.fn(() => mockJqXHR);

    const result = handleCallbackErrors(fn, onError, onFinally);

    // Verify the result is thenable
    expect(typeof result.then).toBe('function');

    // Important: Verify extra methods are preserved via Proxy
    expect(typeof result.abort).toBe('function');
    expect(typeof result.status).toBe('number');
    expect(typeof result.readyState).toBe('number');

    const abortResult = result.abort();
    expect(abortResult).toBe('abort-successful');
    expect(mockJqXHR.abort).toHaveBeenCalledTimes(1);

    // Verify promise functionality still works
    resolvePromise!({ data: 'test' });
    const promiseResult = await result;
    expect(promiseResult).toEqual({ data: 'test' });
    expect(onFinally).toHaveBeenCalledTimes(1);
  });

  it('preserves method binding context', async () => {
    const onError = vi.fn();

    let resolvePromise: (value: unknown) => void;
    const promise = new Promise(resolve => {
      resolvePromise = resolve;
    });

    const mockJqXHR = {
      then: promise.then.bind(promise),
      _internalState: 'test-state',
      getState: function () {
        return this._internalState;
      },
    };

    const fn = vi.fn(() => mockJqXHR);
    const result = handleCallbackErrors(fn, onError);

    // Verify method is bound to original object
    expect(result.getState()).toBe('test-state');

    resolvePromise!('done');
    await result;
  });

  it('does not affect non-thenable values', () => {
    const onError = vi.fn();
    const fn = vi.fn(() => 'plain-value');

    const result = handleCallbackErrors(fn, onError);

    expect(result).toBe('plain-value');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
