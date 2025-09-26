import { describe, expect, it, vi } from 'vitest';
import { handleCallbackErrors } from '../../../src/utils/handleCallbackErrors';

describe('handleCallbackErrors', () => {
  it('works with a simple callback', () => {
    const onError = vi.fn();

    const fn = vi.fn(() => 'aa');

    const res = handleCallbackErrors(fn, onError);

    expect(res).toBe('aa');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('triggers onError when callback has sync error', () => {
    const error = new Error('test error');

    const onError = vi.fn();

    const fn = vi.fn(() => {
      throw error;
    });

    expect(() => handleCallbackErrors(fn, onError)).toThrow(error);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('works with an async callback', async () => {
    const onError = vi.fn();

    const fn = vi.fn(async () => 'aa');

    const res = handleCallbackErrors(fn, onError);

    expect(res).toBeInstanceOf(Promise);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();

    const value = await res;
    expect(value).toBe('aa');
  });

  it('triggers onError when callback returns promise that rejects', async () => {
    const onError = vi.fn();

    const error = new Error('test error');

    const fn = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      throw error;
    });

    const res = handleCallbackErrors(fn, onError);

    expect(res).toBeInstanceOf(Promise);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();

    await expect(res).rejects.toThrow(error);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
  });

  describe('onFinally', () => {
    it('triggers after successful sync callback', () => {
      const onError = vi.fn();
      const onFinally = vi.fn();

      const fn = vi.fn(() => 'aa');

      const res = handleCallbackErrors(fn, onError, onFinally);

      expect(res).toBe('aa');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
      expect(onFinally).toHaveBeenCalledTimes(1);
    });

    it('triggers after error in sync callback', () => {
      const error = new Error('test error');

      const onError = vi.fn();
      const onFinally = vi.fn();

      const fn = vi.fn(() => {
        throw error;
      });

      expect(() => handleCallbackErrors(fn, onError, onFinally)).toThrow(error);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(error);
      expect(onFinally).toHaveBeenCalledTimes(1);
    });

    it('triggers after successful async callback', async () => {
      const onError = vi.fn();
      const onFinally = vi.fn();

      const fn = vi.fn(async () => 'aa');

      const res = handleCallbackErrors(fn, onError, onFinally);

      expect(res).toBeInstanceOf(Promise);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
      expect(onFinally).not.toHaveBeenCalled();

      const value = await res;
      expect(value).toBe('aa');

      expect(onFinally).toHaveBeenCalledTimes(1);
    });

    it('triggers after error in async callback', async () => {
      const onError = vi.fn();
      const onFinally = vi.fn();

      const error = new Error('test error');

      const fn = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        throw error;
      });

      const res = handleCallbackErrors(fn, onError, onFinally);

      expect(res).toBeInstanceOf(Promise);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
      expect(onFinally).not.toHaveBeenCalled();

      await expect(res).rejects.toThrow(error);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(error);
      expect(onFinally).toHaveBeenCalledTimes(1);
    });
  });

  describe('onSuccess', () => {
    it('triggers after successful sync callback', () => {
      const onError = vi.fn();
      const onFinally = vi.fn();
      const onSuccess = vi.fn();

      const fn = vi.fn(() => 'aa');

      const res = handleCallbackErrors(fn, onError, onFinally, onSuccess);

      expect(res).toBe('aa');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
      expect(onFinally).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith('aa');
    });

    it('does not trigger onSuccess after error in sync callback', () => {
      const error = new Error('test error');

      const onError = vi.fn();
      const onFinally = vi.fn();
      const onSuccess = vi.fn();

      const fn = vi.fn(() => {
        throw error;
      });

      expect(() => handleCallbackErrors(fn, onError, onFinally, onSuccess)).toThrow(error);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(error);
      expect(onFinally).toHaveBeenCalledTimes(1);
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('triggers after successful async callback', async () => {
      const onError = vi.fn();
      const onFinally = vi.fn();
      const onSuccess = vi.fn();

      const fn = vi.fn(async () => 'aa');

      const res = handleCallbackErrors(fn, onError, onFinally, onSuccess);

      expect(res).toBeInstanceOf(Promise);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
      expect(onFinally).not.toHaveBeenCalled();

      const value = await res;
      expect(value).toBe('aa');

      expect(onFinally).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalledWith('aa');
    });

    it('does not trigger onSuccess after error in async callback', async () => {
      const onError = vi.fn();
      const onFinally = vi.fn();
      const onSuccess = vi.fn();

      const error = new Error('test error');

      const fn = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        throw error;
      });

      const res = handleCallbackErrors(fn, onError, onFinally, onSuccess);

      expect(res).toBeInstanceOf(Promise);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
      expect(onFinally).not.toHaveBeenCalled();

      await expect(res).rejects.toThrow(error);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(error);
      expect(onFinally).toHaveBeenCalledTimes(1);
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });
});
