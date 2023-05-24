import { getCurrentHub } from '@sentry/core';

import * as HandleScope from '../../../src/coreHandlers/handleScope';
import { mockSdk } from './../../index';

jest.useFakeTimers();

describe('Integration | coreHandlers | handleScope', () => {
  it('returns a breadcrumb only if last breadcrumb has changed', async function () {
    const { replay } = await mockSdk({ autoStart: false });

    // Note: mocks don't work for calls inside of the same module,
    // So we need to make sure to mock the `handleScopeListener` call itself
    const mockHandleScope = jest.spyOn(HandleScope, 'handleScope');
    const mockHandleScopeListener = jest.spyOn(HandleScope, 'handleScopeListener').mockImplementation(() => {
      return scope => {
        return HandleScope.handleScope(scope);
      };
    });

    await replay.start();
    jest.runAllTimers();

    expect(mockHandleScopeListener).toHaveBeenCalledTimes(1);

    getCurrentHub().getScope()?.addBreadcrumb({ category: 'console', message: 'testing' });

    expect(mockHandleScope).toHaveBeenCalledTimes(1);
    expect(mockHandleScope).toHaveReturnedWith(expect.objectContaining({ category: 'console', message: 'testing' }));

    mockHandleScope.mockClear();

    // This will trigger breadcrumb/scope listener, but handleScope should return
    // null because breadcrumbs has not changed
    getCurrentHub().getScope()?.setUser({ email: 'foo@foo.com' });
    expect(mockHandleScope).toHaveBeenCalledTimes(1);
    expect(mockHandleScope).toHaveReturnedWith(null);
  });
});
