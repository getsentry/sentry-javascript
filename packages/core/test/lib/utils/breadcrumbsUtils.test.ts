import { getBreadcrumbLogLevel } from '../../../src/utils/breadcrumbsUtils';

describe('getBreadcrumbLogLevel()', () => {
  it.each([
    [{ level: 'warning' }, '4xx', 403],
    [{ level: 'error' }, '5xx', 500],
    [{}, '3xx', 307],
    [{}, '2xx', 200],
    [{}, '1xx', 103],
    [{}, 'undefined', undefined],
  ])('should return `%s` for %s', (output, _codeRange, input) => {
    expect(getBreadcrumbLogLevel(input)).toEqual(output);
  });
});
