import { getNumberOfUrlSegments, stripUrlQueryAndFragment } from '../src/url';

describe('stripQueryStringAndFragment', () => {
  const urlString = 'http://dogs.are.great:1231/yay/';
  const queryString = '?furry=yes&funny=very';
  const fragment = '#adoptnotbuy';

  it('strips query string from url', () => {
    const urlWithQueryString = `${urlString}${queryString}`;
    expect(stripUrlQueryAndFragment(urlWithQueryString)).toBe(urlString);
  });

  it('strips fragment from url', () => {
    const urlWithFragment = `${urlString}${fragment}`;
    expect(stripUrlQueryAndFragment(urlWithFragment)).toBe(urlString);
  });

  it('strips query string and fragment from url', () => {
    const urlWithQueryStringAndFragment = `${urlString}${queryString}${fragment}`;
    expect(stripUrlQueryAndFragment(urlWithQueryStringAndFragment)).toBe(urlString);
  });
});

describe('getNumberOfUrlSegments', () => {
  test.each([
    ['regular path', '/projects/123/views/234', 4],
    ['single param paramaterized path', '/users/:id/details', 3],
    ['multi param paramaterized path', '/stores/:storeId/products/:productId', 4],
    ['regex path', String(/\/api\/post[0-9]/), 2],
  ])('%s', (_: string, input, output) => {
    expect(getNumberOfUrlSegments(input)).toEqual(output);
  });
});
