import { logger } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _clampSpanProcessorTimeout } from '../../src/sdk/initOtel';

describe('_clampSpanProcessorTimeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('works with undefined', () => {
    const loggerWarnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const timeout = _clampSpanProcessorTimeout(undefined);
    expect(timeout).toBe(undefined);
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });

  it('works with positive number', () => {
    const loggerWarnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const timeout = _clampSpanProcessorTimeout(10);
    expect(timeout).toBe(10);
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });

  it('works with 0', () => {
    const loggerWarnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const timeout = _clampSpanProcessorTimeout(0);
    expect(timeout).toBe(undefined);
    expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '`maxSpanWaitDuration` must be a positive number, using default value instead.',
    );
  });

  it('works with negative number', () => {
    const loggerWarnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const timeout = _clampSpanProcessorTimeout(-10);
    expect(timeout).toBe(undefined);
    expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '`maxSpanWaitDuration` must be a positive number, using default value instead.',
    );
  });

  it('works with -Infinity', () => {
    const loggerWarnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const timeout = _clampSpanProcessorTimeout(-Infinity);
    expect(timeout).toBe(undefined);
    expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '`maxSpanWaitDuration` must be a positive number, using default value instead.',
    );
  });

  it('works with Infinity', () => {
    const loggerWarnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const timeout = _clampSpanProcessorTimeout(Infinity);
    expect(timeout).toBe(1_000_000);
    expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
    expect(loggerWarnSpy).toHaveBeenCalledWith('`maxSpanWaitDuration` is too high, using the maximum value of 1000000');
  });

  it('works with large number', () => {
    const loggerWarnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const timeout = _clampSpanProcessorTimeout(1_000_000_000);
    expect(timeout).toBe(1_000_000);
    expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
    expect(loggerWarnSpy).toHaveBeenCalledWith('`maxSpanWaitDuration` is too high, using the maximum value of 1000000');
  });

  it('works with NaN', () => {
    const loggerWarnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const timeout = _clampSpanProcessorTimeout(NaN);
    expect(timeout).toBe(undefined);
    expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '`maxSpanWaitDuration` must be a positive number, using default value instead.',
    );
  });
});
