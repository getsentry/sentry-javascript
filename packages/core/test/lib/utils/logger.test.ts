import { beforeEach, describe, expect, it, vi } from 'vitest';
import { debug } from '../../../src';
import { getMainCarrier, getSentryCarrier } from '../../../src/carrier';

describe('debug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSentryCarrier(getMainCarrier()).loggerSettings = undefined;
  });

  it('works with defaults', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    debug.log('test');
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(debug.isEnabled()).toBe(false);
  });

  it('allows to enable and disable logging', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    debug.log('test');
    expect(debug.isEnabled()).toBe(false);
    expect(consoleLogSpy).not.toHaveBeenCalled();

    debug.enable();
    debug.log('test');
    expect(debug.isEnabled()).toBe(true);
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);

    debug.log('test2');
    expect(consoleLogSpy).toHaveBeenCalledTimes(2);

    debug.disable();

    debug.log('test3');
    expect(debug.isEnabled()).toBe(false);
    expect(consoleLogSpy).toHaveBeenCalledTimes(2);
  });

  it('picks up enabled logger settings from carrier', () => {
    getSentryCarrier(getMainCarrier()).loggerSettings = { enabled: true };

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    debug.log('test');
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(debug.isEnabled()).toBe(true);
  });

  it('picks up disabled logger settings from carrier', () => {
    getSentryCarrier(getMainCarrier()).loggerSettings = { enabled: false };

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    debug.log('test');
    expect(consoleLogSpy).toHaveBeenCalledTimes(0);
    expect(debug.isEnabled()).toBe(false);
  });
});
