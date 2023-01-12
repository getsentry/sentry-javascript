import { debounce } from '../../../src/util/debounce';

describe('Unit | util | debounce', () => {
  jest.useFakeTimers();
  it('delay the execution of the passed callback function by the passed minDelay', () => {
    const callback = jest.fn();
    const debouncedCallback = debounce(callback, 100);
    debouncedCallback();
    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(99);
    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalled();
  });

  it('should invoke the callback at latest by maxWait, if the option is specified', () => {
    const callback = jest.fn();
    const debouncedCallback = debounce(callback, 100, { maxWait: 150 });
    debouncedCallback();
    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(98);
    expect(callback).not.toHaveBeenCalled();

    debouncedCallback();

    jest.advanceTimersByTime(1);
    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(49);
    // at this time, the callback shouldn't be invoked and with a new call, it should be devounced further.
    debouncedCallback();
    expect(callback).not.toHaveBeenCalled();

    // But because the maxWait is reached, the callback should nevertheless be invoked.
    jest.advanceTimersByTime(10);
    expect(callback).toHaveBeenCalled();
  });

  it('should not invoke the callback as long as it is debounced and no maxWait option is specified', () => {
    const callback = jest.fn();
    const debouncedCallback = debounce(callback, 100);
    debouncedCallback();
    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(99);
    expect(callback).not.toHaveBeenCalled();

    debouncedCallback();

    jest.advanceTimersByTime(1);
    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(98);
    debouncedCallback();
    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(99);
    expect(callback).not.toHaveBeenCalled();
    debouncedCallback();

    jest.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalled();
  });

  it('should invoke the callback as soon as callback.flush() is called', () => {
    const callback = jest.fn();
    const debouncedCallback = debounce(callback, 100, { maxWait: 200 });
    debouncedCallback();
    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(10);
    expect(callback).not.toHaveBeenCalled();

    debouncedCallback.flush();
    expect(callback).toHaveBeenCalled();
  });

  it('should not invoke the callback, if  callback.cancel() is called', () => {
    const callback = jest.fn();
    const debouncedCallback = debounce(callback, 100, { maxWait: 200 });
    debouncedCallback();
    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(99);
    expect(callback).not.toHaveBeenCalled();

    // If the callback is canceled, it should not be invoked after the minwait
    debouncedCallback.cancel();
    jest.advanceTimersByTime(1);
    expect(callback).not.toHaveBeenCalled();

    // And it should also not be invoked after the maxWait
    jest.advanceTimersByTime(500);
    expect(callback).not.toHaveBeenCalled();
  });

  it("should return the callback's return value when calling callback.flush()", () => {
    const callback = jest.fn().mockReturnValue('foo');
    const debouncedCallback = debounce(callback, 100);

    debouncedCallback();

    const returnValue = debouncedCallback.flush();
    expect(returnValue).toBe('foo');
  });

  it('should return the callbacks return value on subsequent calls of the debounced function', () => {
    const callback = jest.fn().mockReturnValue('foo');
    const debouncedCallback = debounce(callback, 100);

    const returnValue1 = debouncedCallback();
    expect(returnValue1).toBe(undefined);
    expect(callback).not.toHaveBeenCalled();

    // now we expect the callback to have been invoked
    jest.advanceTimersByTime(200);
    expect(callback).toHaveBeenCalledTimes(1);

    // calling the debounced function now should return the return value of the callback execution
    const returnValue2 = debouncedCallback();
    expect(returnValue2).toBe('foo');
    expect(callback).toHaveBeenCalledTimes(1);

    // and the callback should also be invoked again
    jest.advanceTimersByTime(200);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('should handle return values of consecutive invocations without maxWait', () => {
    let i = 0;
    const callback = jest.fn().mockImplementation(() => {
      return `foo-${++i}`;
    });
    const debouncedCallback = debounce(callback, 100);

    const returnValue0 = debouncedCallback();
    expect(returnValue0).toBe(undefined);
    expect(callback).not.toHaveBeenCalled();

    // now we expect the callback to have been invoked
    jest.advanceTimersByTime(200);
    expect(callback).toHaveBeenCalledTimes(1);

    // calling the debounced function now should return the return value of the callback execution
    const returnValue1 = debouncedCallback();
    expect(returnValue1).toBe('foo-1');
    expect(callback).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);
    const returnValue2 = debouncedCallback();
    expect(returnValue2).toBe('foo-1');
    expect(callback).toHaveBeenCalledTimes(1);

    // and the callback should also be invoked again
    jest.advanceTimersByTime(200);
    const returnValue3 = debouncedCallback();
    expect(returnValue3).toBe('foo-2');
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('should handle return values of consecutive invocations with maxWait', () => {
    let i = 0;
    const callback = jest.fn().mockImplementation(() => {
      return `foo-${++i}`;
    });
    const debouncedCallback = debounce(callback, 150, { maxWait: 200 });

    const returnValue0 = debouncedCallback();
    expect(returnValue0).toBe(undefined);
    expect(callback).not.toHaveBeenCalled();

    // now we expect the callback to have been invoked
    jest.advanceTimersByTime(149);
    const returnValue1 = debouncedCallback();
    expect(returnValue1).toBe(undefined);
    expect(callback).not.toHaveBeenCalled();

    // calling the debounced function now should return the return value of the callback execution
    // as it was executed because of maxWait
    jest.advanceTimersByTime(51);
    const returnValue2 = debouncedCallback();
    expect(returnValue2).toBe('foo-1');
    expect(callback).toHaveBeenCalledTimes(1);

    // at this point (100ms after the last debounce call), nothing should have happened
    jest.advanceTimersByTime(100);
    const returnValue3 = debouncedCallback();
    expect(returnValue3).toBe('foo-1');
    expect(callback).toHaveBeenCalledTimes(1);

    // and the callback should now have been invoked again
    jest.advanceTimersByTime(150);
    const returnValue4 = debouncedCallback();
    expect(returnValue4).toBe('foo-2');
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('should handle return values of consecutive invocations after a cancellation', () => {
    let i = 0;
    const callback = jest.fn().mockImplementation(() => {
      return `foo-${++i}`;
    });
    const debouncedCallback = debounce(callback, 150, { maxWait: 200 });

    const returnValue0 = debouncedCallback();
    expect(returnValue0).toBe(undefined);
    expect(callback).not.toHaveBeenCalled();

    // now we expect the callback to have been invoked
    jest.advanceTimersByTime(149);
    const returnValue1 = debouncedCallback();
    expect(returnValue1).toBe(undefined);
    expect(callback).not.toHaveBeenCalled();

    debouncedCallback.cancel();

    // calling the debounced function now still return undefined because we cancelled the invocation
    jest.advanceTimersByTime(51);
    const returnValue2 = debouncedCallback();
    expect(returnValue2).toBe(undefined);
    expect(callback).not.toHaveBeenCalled();

    // and the callback should also be invoked again
    jest.advanceTimersByTime(150);
    const returnValue3 = debouncedCallback();
    expect(returnValue3).toBe('foo-1');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should handle the return value of calling flush after cancelling', () => {
    const callback = jest.fn().mockReturnValue('foo');
    const debouncedCallback = debounce(callback, 100);

    debouncedCallback();
    debouncedCallback.cancel();

    const returnValue = debouncedCallback.flush();
    expect(returnValue).toBe(undefined);
  });

  it('should handle equal wait and maxWait values and only invoke func once', () => {
    const callback = jest.fn().mockReturnValue('foo');
    const debouncedCallback = debounce(callback, 100, { maxWait: 100 });

    debouncedCallback();
    jest.advanceTimersByTime(100);

    expect(callback).toHaveBeenCalledTimes(1);

    const retval = debouncedCallback();
    expect(retval).toBe('foo');

    jest.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(2);
  });
});
