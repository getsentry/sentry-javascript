import { describe, expect, it } from 'vitest';
import { getBreadcrumbLogLevelFromHttpStatusCode } from '../../../src/utils/breadcrumb-log-level';

describe('getBreadcrumbLogLevelFromHttpStatusCode()', () => {
  it.each([
    ['warning', '4xx', 403],
    ['error', '5xx', 500],
    [undefined, '3xx', 307],
    [undefined, '2xx', 200],
    [undefined, '1xx', 103],
    [undefined, '0', 0],
    [undefined, 'undefined', undefined],
  ])('should return `%s` for %s', (output, _codeRange, input) => {
    expect(getBreadcrumbLogLevelFromHttpStatusCode(input)).toEqual(output);
  });
});
