import type { SeverityLevel } from '@sentry/types';
import { getBreadcrumbLogLevel } from '../../../src/utils/breadcrumbsUtils';

describe('getBreadcrumbLogLevel()', () => {
  it.each([
    ['warning', '4xx', 403],
    ['error', '5xx', 500],
    ['info', '3xx', 307],
    ['info', '2xx', 200],
    ['info', '1xx', 103],
    ['info', 'undefined', undefined],
  ] as [SeverityLevel, string, number | undefined][])('should return `%s` for %s', (output, _codeRange, input) => {
    expect(getBreadcrumbLogLevel(input)).toBe(output);
  });
});
