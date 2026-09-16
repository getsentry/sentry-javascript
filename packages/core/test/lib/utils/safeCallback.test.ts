import { afterEach, describe, expect, it, vi } from 'vitest';
import { debug } from '../../../src/utils/debug-logger';
import { safeCallback } from '../../../src/utils/safeCallback';

describe('safeCallback', () => {
  const debugErrorSpy = vi.spyOn(debug, 'error').mockImplementation(() => undefined);

  afterEach(() => {
    debugErrorSpy.mockClear();
  });

  it('returns the result of a sync callback', () => {
    const fallback = vi.fn(() => 'fallback');

    expect(safeCallback('callback threw:', () => 'value', fallback)).toBe('value');
    expect(fallback).not.toHaveBeenCalled();
    expect(debugErrorSpy).not.toHaveBeenCalled();
  });

  it('returns the fallback and logs when a sync callback throws', () => {
    const error = new Error('boom');
    const fallback = vi.fn(() => 'fallback');

    expect(
      safeCallback(
        'callback threw:',
        () => {
          throw error;
        },
        fallback,
      ),
    ).toBe('fallback');
    expect(fallback).toHaveBeenCalledWith(error);
    expect(debugErrorSpy).toHaveBeenCalledWith('callback threw:', error);
  });

  it('resolves to the result of an async callback', async () => {
    const fallback = vi.fn(async () => 'fallback');

    const result = safeCallback('callback threw:', async () => 'value', fallback);

    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBe('value');
    expect(fallback).not.toHaveBeenCalled();
    expect(debugErrorSpy).not.toHaveBeenCalled();
  });

  it('resolves to the fallback and logs when an async callback rejects', async () => {
    const error = new Error('boom');
    const fallback = vi.fn(async () => 'fallback');

    const result = safeCallback('callback threw:', () => Promise.reject(error), fallback);

    await expect(result).resolves.toBe('fallback');
    expect(fallback).toHaveBeenCalledWith(error);
    expect(debugErrorSpy).toHaveBeenCalledWith('callback threw:', error);
  });

  it('does not treat non-thenable objects as promises', () => {
    const value = { then: 'not a function' };

    expect(
      safeCallback(
        'callback threw:',
        () => value,
        () => ({ then: 'fallback' }),
      ),
    ).toBe(value);
  });
});
