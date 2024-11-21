import { vercelWaitUntil } from '../../src/utils-hoist/vercelWaitUntil';
import { GLOBAL_OBJ } from '../../src/utils-hoist/worldwide';

describe('vercelWaitUntil', () => {
  it('should do nothing if GLOBAL_OBJ does not have the @vercel/request-context symbol', () => {
    const task = Promise.resolve();
    vercelWaitUntil(task);
    // No assertions needed, just ensuring no errors are thrown
  });

  it('should do nothing if get method is not defined', () => {
    // @ts-expect-error - Not typed
    GLOBAL_OBJ[Symbol.for('@vercel/request-context')] = {};
    const task = Promise.resolve();
    vercelWaitUntil(task);
    // No assertions needed, just ensuring no errors are thrown
  });

  it('should do nothing if waitUntil method is not defined', () => {
    // @ts-expect-error - Not typed
    GLOBAL_OBJ[Symbol.for('@vercel/request-context')] = {
      get: () => ({}),
    };
    const task = Promise.resolve();
    vercelWaitUntil(task);
    // No assertions needed, just ensuring no errors are thrown
  });

  it('should call waitUntil method if it is defined', () => {
    const waitUntilMock = jest.fn();
    // @ts-expect-error - Not typed
    GLOBAL_OBJ[Symbol.for('@vercel/request-context')] = {
      get: () => ({ waitUntil: waitUntilMock }),
    };
    const task = Promise.resolve();
    vercelWaitUntil(task);
    expect(waitUntilMock).toHaveBeenCalledWith(task);
  });
});
