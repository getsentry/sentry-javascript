import { describe, expect, it, vi } from 'vitest';
import { WINDOW } from '../../src/types';
import { afterEach } from 'node:test';

import { instrumentHistory } from './../../src/instrument/history';

describe('instrumentHistory', () => {
  const originalHistory = WINDOW.history;
  WINDOW.addEventListener = vi.fn();

  afterEach(() => {
    // @ts-expect-error - this is fine for testing
    WINDOW.history = originalHistory;
  });

  it("doesn't throw if history is not available", () => {
    // @ts-expect-error - this is fine for testing
    WINDOW.history = undefined;
    expect(instrumentHistory).not.toThrow();
    expect(WINDOW.history).toBe(undefined);
  });

  it('adds an event listener for popstate', () => {
    // adds an event listener for popstate
    expect(WINDOW.addEventListener).toHaveBeenCalledTimes(1);
    expect(WINDOW.addEventListener).toHaveBeenCalledWith('popstate', expect.any(Function));
  });

  it("doesn't throw if history.pushState is not a function", () => {
    // @ts-expect-error - only partially adding history properties
    WINDOW.history = {
      replaceState: () => {},
      pushState: undefined,
    };

    expect(instrumentHistory).not.toThrow();

    expect(WINDOW.history).toEqual({
      replaceState: expect.any(Function), // patched function
      pushState: undefined, // unpatched
    });
  });

  it("doesn't throw if history.replaceState is not a function", () => {
    // @ts-expect-error - only partially adding history properties
    WINDOW.history = {
      replaceState: undefined,
      pushState: () => {},
    };

    expect(instrumentHistory).not.toThrow();

    expect(WINDOW.history).toEqual({
      replaceState: undefined, // unpatched
      pushState: expect.any(Function), // patched function
    });
  });
});
