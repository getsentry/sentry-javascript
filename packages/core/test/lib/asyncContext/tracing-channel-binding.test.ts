import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAsyncContextStrategy, setAsyncContextStrategy } from '../../../src/asyncContext';
import { waitForTracingChannelBinding } from '../../../src/asyncContext/tracing-channel-binding';
import type { TracingChannelBinding } from '../../../src/asyncContext/types';
import { getMainCarrier } from '../../../src/carrier';

const FAKE_BINDING: TracingChannelBinding = {
  asyncLocalStorage: {},
  getStoreWithActiveSpan: () => ({}),
};

/** Install an async context strategy whose `getTracingChannelBinding` is driven by `provider`. */
function setBindingProvider(provider: (() => TracingChannelBinding | undefined) | undefined): void {
  setAsyncContextStrategy({
    ...getAsyncContextStrategy(getMainCarrier()),
    getTracingChannelBinding: provider,
  });
}

describe('waitForTracingChannelBinding', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setAsyncContextStrategy(undefined);
  });

  afterEach(() => {
    setAsyncContextStrategy(undefined);
    vi.useRealTimers();
  });

  it('runs the callback synchronously when the binding is already available', () => {
    const getBinding = vi.fn(() => FAKE_BINDING);
    setBindingProvider(getBinding);

    const callback = vi.fn();
    waitForTracingChannelBinding(callback);

    expect(callback).toHaveBeenCalledTimes(1);
    // Resolved on the first attempt, so no retry should be scheduled.
    expect(getBinding).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(getBinding).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('retries on the next tick and runs the callback once the binding becomes available', () => {
    const getBinding = vi.fn<[], TracingChannelBinding | undefined>(() => FAKE_BINDING);
    getBinding.mockReturnValueOnce(undefined);
    setBindingProvider(getBinding);

    const callback = vi.fn();
    waitForTracingChannelBinding(callback);

    // Not available on the first (synchronous) attempt.
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not run the callback if the binding never becomes available (default single retry)', () => {
    const getBinding = vi.fn(() => undefined);
    setBindingProvider(getBinding);

    const callback = vi.fn();
    waitForTracingChannelBinding(callback);

    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).not.toHaveBeenCalled();

    // The single retry is exhausted — no further attempts are scheduled.
    expect(getBinding).toHaveBeenCalledTimes(2);
    vi.runAllTimers();
    expect(getBinding).toHaveBeenCalledTimes(2);
    expect(callback).not.toHaveBeenCalled();
  });

  it('does not retry when retries is 0', () => {
    const getBinding = vi.fn(() => undefined);
    setBindingProvider(getBinding);

    const callback = vi.fn();
    waitForTracingChannelBinding(callback, 0);

    expect(callback).not.toHaveBeenCalled();
    expect(getBinding).toHaveBeenCalledTimes(1);

    // No retry is scheduled when no retries remain.
    vi.runAllTimers();
    expect(getBinding).toHaveBeenCalledTimes(1);
    expect(callback).not.toHaveBeenCalled();
  });

  it('honors a custom retry count', () => {
    const getBinding = vi.fn<[], TracingChannelBinding | undefined>(() => FAKE_BINDING);
    getBinding.mockReturnValueOnce(undefined).mockReturnValueOnce(undefined).mockReturnValue(FAKE_BINDING);
    setBindingProvider(getBinding);

    const callback = vi.fn();
    waitForTracingChannelBinding(callback, 2);

    expect(callback).not.toHaveBeenCalled(); // attempt 1 (sync): undefined

    vi.advanceTimersByTime(1);
    expect(callback).not.toHaveBeenCalled(); // attempt 2: undefined

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1); // attempt 3: available
  });

  it('does nothing when the strategy exposes no `getTracingChannelBinding`', () => {
    // The default (stack) strategy has no tracing-channel binding support.
    setAsyncContextStrategy(undefined);

    const callback = vi.fn();
    waitForTracingChannelBinding(callback, 0);

    expect(callback).not.toHaveBeenCalled();
  });
});
