import * as instrumentHandlersModule from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WINDOW } from '../../src/types';
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

  it('does not trigger handlers when the URLs are the same', () => {
    const triggerHandlerSpy = vi.spyOn(instrumentHandlersModule, 'triggerHandlers');
    const pushStateMock = vi.fn();

    // @ts-expect-error - this is fine for testing
    WINDOW.history = {
      pushState: pushStateMock,
      replaceState: () => {},
    };

    instrumentHistory();

    // First call with URL1 to set lastHref
    WINDOW.history.pushState({}, '', 'https://example.com/page1');
    expect(pushStateMock).toHaveBeenCalledTimes(1);

    // Reset mocks to check next call
    pushStateMock.mockClear();
    vi.mocked(triggerHandlerSpy).mockClear();

    // Call with the same URL
    WINDOW.history.pushState({}, '', 'https://example.com/page1');

    expect(pushStateMock).toHaveBeenCalledTimes(1);
    expect(triggerHandlerSpy).not.toHaveBeenCalled();
  });

  it('triggers handlers when the URLs are different', () => {
    const triggerHandlerSpy = vi.spyOn(instrumentHandlersModule, 'triggerHandlers');
    // Setup a mock for history.pushState
    const pushStateMock = vi.fn();

    // @ts-expect-error - this is fine for testing
    WINDOW.history = {
      pushState: pushStateMock,
      replaceState: () => {},
    };

    // Run the instrumentation
    instrumentHistory();

    // First call with URL1 to set lastHref
    WINDOW.history.pushState({}, '', 'https://example.com/page1');
    expect(pushStateMock).toHaveBeenCalledTimes(1);

    // Reset mocks to check next call
    pushStateMock.mockClear();
    vi.mocked(triggerHandlerSpy).mockClear();

    // Call with a different URL
    WINDOW.history.pushState({}, '', 'https://example.com/page2');

    // Original function should be called
    expect(pushStateMock).toHaveBeenCalledTimes(1);

    // triggerHandlers should be called with from and to data
    expect(triggerHandlerSpy).toHaveBeenCalledWith('history', {
      from: 'https://example.com/page1',
      to: 'https://example.com/page2',
    });
  });
});
