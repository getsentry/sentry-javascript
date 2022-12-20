import { debounce } from '../src/debounce';

describe('debounce', () => {
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
});
