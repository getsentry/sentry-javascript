import { describe, expect, it, vi } from 'vitest';
import { safeUnref } from '../../../src/utils/timer';

describe('safeUnref', () => {
  it('calls unref on a NodeJS timer', () => {
    const timeout = setTimeout(() => {}, 1000);
    const unrefSpy = vi.spyOn(timeout, 'unref');
    safeUnref(timeout);
    expect(unrefSpy).toHaveBeenCalledOnce();
  });

  it('returns the timer', () => {
    const timeout = setTimeout(() => {}, 1000);
    const result = safeUnref(timeout);
    expect(result).toBe(timeout);
  });

  it('handles multiple unref calls', () => {
    const timeout = setTimeout(() => {}, 1000);
    const unrefSpy = vi.spyOn(timeout, 'unref');

    const result = safeUnref(timeout);
    result.unref();

    expect(unrefSpy).toHaveBeenCalledTimes(2);
  });

  it("doesn't throw for a browser timer", () => {
    const timer = safeUnref(385 as unknown as ReturnType<typeof setTimeout>);
    expect(timer).toBe(385);
  });
});
