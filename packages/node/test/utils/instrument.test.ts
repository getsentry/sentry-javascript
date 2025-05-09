import { describe, expect, test, vi } from 'vitest';
import { instrumentWhenWrapped } from '../../src/otel/instrument';

describe('instrumentWhenWrapped', () => {
  test('calls callback immediately when instrumentation has no _wrap method', () => {
    const callback = vi.fn();
    const instrumentation = {} as any;

    const registerCallback = instrumentWhenWrapped(instrumentation);
    registerCallback(callback);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('calls callback when _wrap is called', () => {
    const callback = vi.fn();
    const originalWrap = vi.fn();
    const instrumentation = {
      _wrap: originalWrap,
    } as any;

    const registerCallback = instrumentWhenWrapped(instrumentation);
    registerCallback(callback);

    // Callback should not be called yet
    expect(callback).not.toHaveBeenCalled();

    // Call _wrap
    instrumentation._wrap();

    // Callback should be called once
    expect(callback).toHaveBeenCalledTimes(1);
    expect(originalWrap).toHaveBeenCalled();
  });

  test('calls multiple callbacks when _wrap is called', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    const originalWrap = vi.fn();
    const instrumentation = {
      _wrap: originalWrap,
    } as any;

    const registerCallback = instrumentWhenWrapped(instrumentation);
    registerCallback(callback1);
    registerCallback(callback2);

    // Callbacks should not be called yet
    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).not.toHaveBeenCalled();

    // Call _wrap
    instrumentation._wrap();

    // Both callbacks should be called once
    expect(callback1).toHaveBeenCalledTimes(1);
    expect(callback2).toHaveBeenCalledTimes(1);
    expect(originalWrap).toHaveBeenCalled();
  });

  test('calls callback immediately if already wrapped', () => {
    const callback = vi.fn();
    const originalWrap = vi.fn();
    const instrumentation = {
      _wrap: originalWrap,
    } as any;

    const registerCallback = instrumentWhenWrapped(instrumentation);

    // Call _wrap first
    instrumentation._wrap();

    registerCallback(callback);

    // Callback should be called immediately
    expect(callback).toHaveBeenCalledTimes(1);
    expect(originalWrap).toHaveBeenCalled();
  });

  test('passes through arguments to original _wrap', () => {
    const callback = vi.fn();
    const originalWrap = vi.fn();
    const instrumentation = {
      _wrap: originalWrap,
    } as any;

    const registerCallback = instrumentWhenWrapped(instrumentation);
    registerCallback(callback);

    // Call _wrap with arguments
    const args = ['arg1', 'arg2'];
    instrumentation._wrap(...args);

    expect(originalWrap).toHaveBeenCalledWith(...args);
  });
});
