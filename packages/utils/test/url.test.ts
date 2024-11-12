import { getNumberOfUrlSegments, getSanitizedUrlString, parseUrl, stripUrlQueryAndFragment } from '../src/url';

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
    ['single param parameterized path', '/users/:id/details', 3],
    ['multi param parameterized path', '/stores/:storeId/products/:productId', 4],
    ['regex path', String(/\/api\/post[0-9]/), 2],
  ])('%s', (_: string, input, output) => {
    expect(getNumberOfUrlSegments(input)).toEqual(output);
  });
});

describe('getSanitizedUrlString', () => {
  it.each([
    ['regular url', 'https://somedomain.com', 'https://somedomain.com'],
    ['regular url with a path', 'https://somedomain.com/path/to/happiness', 'https://somedomain.com/path/to/happiness'],
    [
      'url with standard http port 80',
      'http://somedomain.com:80/path/to/happiness',
      'http://somedomain.com/path/to/happiness',
    ],
    [
      'url with standard https port 443',
      'https://somedomain.com:443/path/to/happiness',
      'https://somedomain.com/path/to/happiness',
    ],
    [
      'url with non-standard port',
      'https://somedomain.com:4200/path/to/happiness',
      'https://somedomain.com:4200/path/to/happiness',
    ],
    [
      'url with query params',
      'https://somedomain.com:4200/path/to/happiness?auhtToken=abc123&param2=bar',
      'https://somedomain.com:4200/path/to/happiness',
    ],
    [
      'url with a fragment',
      'https://somedomain.com/path/to/happiness#somewildfragment123',
      'https://somedomain.com/path/to/happiness',
    ],
    [
      'url with a fragment and query params',
      'https://somedomain.com/path/to/happiness#somewildfragment123?auhtToken=abc123&param2=bar',
      'https://somedomain.com/path/to/happiness',
    ],
    [
      'url with authorization',
      'https://username:password@somedomain.com',
      'https://[filtered]:[filtered]@somedomain.com',
    ],
    ['same-origin url', '/api/v4/users?id=123', '/api/v4/users'],
    ['url without a protocol', 'example.com', 'example.com'],
    ['url without a protocol with a path', 'example.com/sub/path?id=123', 'example.com/sub/path'],
    ['url with port 8080', 'http://172.31.12.144:8080/test', 'http://172.31.12.144:8080/test'],
    ['url with port 4433', 'http://172.31.12.144:4433/test', 'http://172.31.12.144:4433/test'],
    ['url with port 443', 'http://172.31.12.144:443/test', 'http://172.31.12.144/test'],
    ['url with IP and port 80', 'http://172.31.12.144:80/test', 'http://172.31.12.144/test'],
  ])('returns a sanitized URL for a %s', (_, rawUrl: string, sanitizedURL: string) => {
    const urlObject = parseUrl(rawUrl);
    expect(getSanitizedUrlString(urlObject)).toEqual(sanitizedURL);
  });
});
