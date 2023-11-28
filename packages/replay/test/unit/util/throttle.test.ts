import { BASE_TIMESTAMP } from '../..';
import { SKIPPED, THROTTLED, throttle } from '../../../src/util/throttle';

jest.useFakeTimers();

describe('Unit | util | throttle', () => {
  it('executes when not hitting the limit', () => {
    const now = BASE_TIMESTAMP;
    jest.setSystemTime(now);

    const callback = jest.fn();
    const fn = throttle(callback, 100, 60);

    fn();
    fn();
    fn();

    expect(callback).toHaveBeenCalledTimes(3);

    jest.advanceTimersByTime(59_000);

    fn();
    fn();

    expect(callback).toHaveBeenCalledTimes(5);

    jest.advanceTimersByTime(1_000);

    fn();

    expect(callback).toHaveBeenCalledTimes(6);

    jest.advanceTimersByTime(1_000);

    fn();

    expect(callback).toHaveBeenCalledTimes(7);
  });

  it('stops executing when hitting the limit', () => {
    const now = BASE_TIMESTAMP;
    jest.setSystemTime(now);
    const callback = jest.fn();
    const fn = throttle(callback, 5, 60);

    fn();
    fn();
    fn();

    expect(callback).toHaveBeenCalledTimes(3);

    jest.advanceTimersByTime(59_000);

    fn();
    fn();

    expect(callback).toHaveBeenCalledTimes(5);

    jest.advanceTimersByTime(1_000);

    fn();
    fn();
    fn();
    fn();

    expect(callback).toHaveBeenCalledTimes(5);

    // Now, the first three will "expire", so we can add three more
    jest.advanceTimersByTime(1_000);

    fn();
    fn();
    fn();
    fn();

    expect(callback).toHaveBeenCalledTimes(8);
  });

  it('has correct return value', () => {
    const now = BASE_TIMESTAMP;
    jest.setSystemTime(now);

    const callback = jest.fn(() => 'foo');
    const fn = throttle(callback, 5, 60);

    expect(fn()).toBe('foo');
    expect(fn()).toBe('foo');
    expect(fn()).toBe('foo');
    expect(fn()).toBe('foo');
    expect(fn()).toBe('foo');
    expect(fn()).toBe(THROTTLED);
    expect(fn()).toBe(SKIPPED);
    expect(fn()).toBe(SKIPPED);

    // After 61s, should be reset
    jest.advanceTimersByTime(61_000);

    expect(fn()).toBe('foo');
    expect(fn()).toBe('foo');
    expect(fn()).toBe('foo');
    expect(fn()).toBe('foo');
    expect(fn()).toBe('foo');
    expect(fn()).toBe(THROTTLED);
    expect(fn()).toBe(SKIPPED);
    expect(fn()).toBe(SKIPPED);
  });

  it('passes args correctly', () => {
    const now = BASE_TIMESTAMP;
    jest.setSystemTime(now);

    const originalFunction = (a: number, b: number) => a + b;
    const callback = jest.fn(originalFunction);
    const fn = throttle(callback, 5, 60);

    expect(fn(1, 2)).toBe(3);
    expect(fn(1, 2)).toBe(3);
    expect(fn(1, 2)).toBe(3);
    expect(fn(1, 2)).toBe(3);
    expect(fn(1, 2)).toBe(3);
    expect(fn(1, 2)).toBe(THROTTLED);
    expect(fn(1, 2)).toBe(SKIPPED);
    expect(fn(1, 2)).toBe(SKIPPED);
  });
});
