import type { Breadcrumb, Scope } from '@sentry/types';

import { CONSOLE_ARG_MAX_SIZE } from '../../../src/constants';
import * as HandleScope from '../../../src/coreHandlers/handleScope';

describe('Unit | coreHandlers | handleScope', () => {
  let mockHandleScope: jest.SpyInstance;

  beforeEach(() => {
    mockHandleScope = jest.spyOn(HandleScope, 'handleScope');
    mockHandleScope.mockClear();
  });

  it('returns a breadcrumb only if last breadcrumb has changed', function () {
    const scope = {
      _breadcrumbs: [],
      getLastBreadcrumb() {
        return this._breadcrumbs[this._breadcrumbs.length - 1];
      },
    } as unknown as Scope;

    function addBreadcrumb(breadcrumb: Breadcrumb) {
      // @ts-ignore using private member
      scope._breadcrumbs.push(breadcrumb);
    }

    const testMsg = {
      timestamp: Date.now() / 1000,
      message: 'testing',
      category: 'console',
    };

    addBreadcrumb(testMsg);
    // integration testing here is a bit tricky, because the core SDK can
    // interfere with console output from test runner
    HandleScope.handleScope(scope);
    expect(mockHandleScope).toHaveBeenCalledTimes(1);
    expect(mockHandleScope).toHaveReturnedWith(expect.objectContaining({ message: 'testing', category: 'console' }));

    // This will trigger breadcrumb/scope listener, but handleScope should return
    // null because breadcrumbs has not changed
    mockHandleScope.mockClear();
    HandleScope.handleScope(scope);
    expect(mockHandleScope).toHaveBeenCalledTimes(1);
    expect(mockHandleScope).toHaveReturnedWith(null);

    mockHandleScope.mockClear();
    addBreadcrumb({
      message: 'f00',
      category: 'console',
    });
    HandleScope.handleScope(scope);
    expect(mockHandleScope).toHaveBeenCalledTimes(1);
    expect(mockHandleScope).toHaveReturnedWith(expect.objectContaining({ message: 'f00', category: 'console' }));
  });

  it('returns null if the method does not exist on the scope', () => {
    const scope = {} as unknown as Scope;
    HandleScope.handleScope(scope);
    expect(mockHandleScope).toHaveBeenCalledTimes(1);
    expect(mockHandleScope).toHaveReturnedWith(null);
  });

  describe('normalizeConsoleBreadcrumb', () => {
    it('handles console messages with no arguments', () => {
      const breadcrumb: Breadcrumb = { category: 'console', message: 'test' };
      const actual = HandleScope.normalizeConsoleBreadcrumb(breadcrumb);

      expect(actual).toMatchObject({ category: 'console', message: 'test' });
    });

    it('handles console messages with empty arguments', () => {
      const breadcrumb: Breadcrumb = { category: 'console', message: 'test', data: { arguments: [] } };
      const actual = HandleScope.normalizeConsoleBreadcrumb(breadcrumb);

      expect(actual).toMatchObject({ category: 'console', message: 'test', data: { arguments: [] } });
    });

    it('handles console messages with simple arguments', () => {
      const breadcrumb: Breadcrumb = {
        category: 'console',
        message: 'test',
        data: { arguments: [1, 'a', true, null, undefined] },
      };
      const actual = HandleScope.normalizeConsoleBreadcrumb(breadcrumb);

      expect(actual).toMatchObject({
        category: 'console',
        message: 'test',
        data: {
          arguments: [1, 'a', true, null, undefined],
        },
      });
    });

    it('truncates large strings', () => {
      const breadcrumb: Breadcrumb = {
        category: 'console',
        message: 'test',
        data: {
          arguments: ['a'.repeat(CONSOLE_ARG_MAX_SIZE + 10), 'b'.repeat(CONSOLE_ARG_MAX_SIZE + 10)],
        },
      };
      const actual = HandleScope.normalizeConsoleBreadcrumb(breadcrumb);

      expect(actual).toMatchObject({
        category: 'console',
        message: 'test',
        data: {
          arguments: [`${'a'.repeat(CONSOLE_ARG_MAX_SIZE)}…`, `${'b'.repeat(CONSOLE_ARG_MAX_SIZE)}…`],
          _meta: { warnings: ['CONSOLE_ARG_TRUNCATED'] },
        },
      });
    });

    it('truncates large JSON objects', () => {
      const breadcrumb: Breadcrumb = {
        category: 'console',
        message: 'test',
        data: {
          arguments: [
            { aa: 'yes' },
            { bb: 'b'.repeat(CONSOLE_ARG_MAX_SIZE + 10) },
            { c: 'c'.repeat(CONSOLE_ARG_MAX_SIZE + 10) },
          ],
        },
      };
      const actual = HandleScope.normalizeConsoleBreadcrumb(breadcrumb);

      expect(actual).toMatchObject({
        category: 'console',
        message: 'test',
        data: {
          arguments: [
            { aa: 'yes' },
            { bb: `${'b'.repeat(CONSOLE_ARG_MAX_SIZE - 7)}~~` },
            { c: `${'c'.repeat(CONSOLE_ARG_MAX_SIZE - 6)}~~` },
          ],
          _meta: { warnings: ['CONSOLE_ARG_TRUNCATED'] },
        },
      });
    });
  });
});
