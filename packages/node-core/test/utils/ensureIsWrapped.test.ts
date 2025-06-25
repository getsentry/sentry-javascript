import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureIsWrapped } from '../../src/utils/ensureIsWrapped';
import { cleanupOtel, mockSdkInit, resetGlobals } from '../helpers/mockSdkInit';

const unwrappedFunction = () => {};

// We simulate a wrapped function
const wrappedfunction = Object.assign(() => {}, {
  __wrapped: true,
  __original: () => {},
  __unwrap: () => {},
});

describe('ensureIsWrapped', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanupOtel();
    resetGlobals();
  });

  it('warns when the method is unwrapped', () => {
    const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockSdkInit({ tracesSampleRate: 1 });

    ensureIsWrapped(unwrappedFunction, 'express');

    expect(spyWarn).toHaveBeenCalledTimes(1);
    expect(spyWarn).toHaveBeenCalledWith(
      '[Sentry] express is not instrumented. This is likely because you required/imported express before calling `Sentry.init()`.',
    );
  });

  it('does not warn when the method is wrapped', () => {
    const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockSdkInit({ tracesSampleRate: 1 });

    ensureIsWrapped(wrappedfunction, 'express');

    expect(spyWarn).toHaveBeenCalledTimes(0);
  });

  it('does not warn without a client', () => {
    const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resetGlobals();

    ensureIsWrapped(wrappedfunction, 'express');

    expect(spyWarn).toHaveBeenCalledTimes(0);
  });

  it('does not warn without tracing', () => {
    const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockSdkInit({});

    ensureIsWrapped(unwrappedFunction, 'express');

    expect(spyWarn).toHaveBeenCalledTimes(0);
  });

  it('does not warn if disableInstrumentationWarnings=true', () => {
    const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockSdkInit({ tracesSampleRate: 1, disableInstrumentationWarnings: true });

    ensureIsWrapped(unwrappedFunction, 'express');

    expect(spyWarn).toHaveBeenCalledTimes(0);
  });
});
