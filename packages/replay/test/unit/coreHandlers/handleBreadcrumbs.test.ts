import { CONSOLE_ARG_MAX_SIZE } from '../../../src/constants';
import { normalizeBreadcrumb, normalizeConsoleBreadcrumb } from '../../../src/coreHandlers/handleBreadcrumbs';

describe('Unit | coreHandlers | handleBreadcrumbs', () => {
  describe('normalizeBreadcrumb', () => {
    it.each([undefined, 'ui.click', 'ui.scroll', 'fetch', 'xhr', 'sentry.event', 'sentry.transaction'])(
      'returns null if breadcrumb has category=%p',
      category => {
        const actual = normalizeBreadcrumb({ category });
        expect(actual).toBeNull();
      },
    );

    it('returns breadcrumb when category is valid', () => {
      const breadcrumb = { category: 'other' };
      const actual = normalizeBreadcrumb(breadcrumb);
      expect(actual).toEqual({
        timestamp: expect.any(Number),
        category: 'other',
        type: 'default',
      });
    });

    it('timestamp takes precedence', () => {
      const breadcrumb = { category: 'other', timestamp: 123456 };
      const actual = normalizeBreadcrumb(breadcrumb);
      expect(actual).toEqual({
        timestamp: 123456,
        category: 'other',
        type: 'default',
      });
    });

    it('handles console breadcrumb', () => {
      const breadcrumb = {
        category: 'console',
        message: 'test',
        data: {
          arguments: ['a'.repeat(CONSOLE_ARG_MAX_SIZE + 10), 'b'.repeat(CONSOLE_ARG_MAX_SIZE + 10)],
        },
      };
      const actual = normalizeBreadcrumb(breadcrumb);
      expect(actual).toEqual({
        timestamp: expect.any(Number),
        category: 'console',
        message: 'test',
        type: 'default',
        data: {
          arguments: [`${'a'.repeat(CONSOLE_ARG_MAX_SIZE)}…`, `${'b'.repeat(CONSOLE_ARG_MAX_SIZE)}…`],
          _meta: { warnings: ['CONSOLE_ARG_TRUNCATED'] },
        },
      });
    });
  });

  describe('normalizeConsoleBreadcrumb', () => {
    it('handles console messages with no arguments', () => {
      const breadcrumb = { category: 'console', message: 'test' };
      const actual = normalizeConsoleBreadcrumb(breadcrumb);

      expect(actual).toMatchObject({ category: 'console', message: 'test' });
    });

    it('handles console messages with empty arguments', () => {
      const breadcrumb = { category: 'console', message: 'test', data: { arguments: [] } };
      const actual = normalizeConsoleBreadcrumb(breadcrumb);

      expect(actual).toMatchObject({ category: 'console', message: 'test', data: { arguments: [] } });
    });

    it('handles console messages with simple arguments', () => {
      const breadcrumb = {
        category: 'console',
        message: 'test',
        data: { arguments: [1, 'a', true, null, undefined] },
      };
      const actual = normalizeConsoleBreadcrumb(breadcrumb);

      expect(actual).toMatchObject({
        category: 'console',
        message: 'test',
        data: {
          arguments: [1, 'a', true, null, undefined],
        },
      });
    });

    it('truncates large strings', () => {
      const breadcrumb = {
        category: 'console',
        message: 'test',
        data: {
          arguments: ['a'.repeat(CONSOLE_ARG_MAX_SIZE + 10), 'b'.repeat(CONSOLE_ARG_MAX_SIZE + 10)],
        },
      };
      const actual = normalizeConsoleBreadcrumb(breadcrumb);

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
      const bb = { bb: 'b'.repeat(CONSOLE_ARG_MAX_SIZE + 10) };
      const c = { c: 'c'.repeat(CONSOLE_ARG_MAX_SIZE + 10) };

      const breadcrumb = {
        category: 'console',
        message: 'test',
        data: {
          arguments: [{ aa: 'yes' }, bb, c],
        },
      };
      const actual = normalizeConsoleBreadcrumb(breadcrumb);

      expect(actual).toMatchObject({
        category: 'console',
        message: 'test',
        data: {
          arguments: [
            { aa: 'yes' },
            `${JSON.stringify(bb, null, 2).slice(0, CONSOLE_ARG_MAX_SIZE)}…`,
            `${JSON.stringify(c, null, 2).slice(0, CONSOLE_ARG_MAX_SIZE)}…`,
          ],
          _meta: { warnings: ['CONSOLE_ARG_TRUNCATED'] },
        },
      });
    });
  });
});
