import { handleCallbackErrors } from '../../../src/utils/handleCallbackErrors';

describe('handleCallbackErrors', () => {
  it('works with a simple callback', () => {
    const onError = jest.fn();

    const fn = jest.fn(() => 'aa');

    const res = handleCallbackErrors(fn, onError);

    expect(res).toBe('aa');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('triggers onError when callback has sync error', () => {
    const error = new Error('test error');

    const onError = jest.fn();

    const fn = jest.fn(() => {
      throw error;
    });

    expect(() => handleCallbackErrors(fn, onError)).toThrow(error);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('works with an async callback', async () => {
    const onError = jest.fn();

    const fn = jest.fn(async () => 'aa');

    const res = handleCallbackErrors(fn, onError);

    expect(res).toBeInstanceOf(Promise);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();

    const value = await res;
    expect(value).toBe('aa');
  });

  it('triggers onError when callback returns promise that rejects', async () => {
    const onError = jest.fn();

    const error = new Error('test error');

    const fn = jest.fn(async () => {
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
      const onError = jest.fn();
      const onFinally = jest.fn();

      const fn = jest.fn(() => 'aa');

      const res = handleCallbackErrors(fn, onError, onFinally);

      expect(res).toBe('aa');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
      expect(onFinally).toHaveBeenCalledTimes(1);
    });

    it('triggers after error in sync callback', () => {
      const error = new Error('test error');

      const onError = jest.fn();
      const onFinally = jest.fn();

      const fn = jest.fn(() => {
        throw error;
      });

      expect(() => handleCallbackErrors(fn, onError, onFinally)).toThrow(error);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(error);
      expect(onFinally).toHaveBeenCalledTimes(1);
    });

    it('triggers after successful async callback', async () => {
      const onError = jest.fn();
      const onFinally = jest.fn();

      const fn = jest.fn(async () => 'aa');

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
      const onError = jest.fn();
      const onFinally = jest.fn();

      const error = new Error('test error');

      const fn = jest.fn(async () => {
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
});
