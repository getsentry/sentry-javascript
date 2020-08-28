import { RequestOptions } from 'http';

import { extractUrl } from './../../src/integrations/http';

describe('extractUrl()', () => {
  const urlString = 'http://dogs.are.great:1231/yay/';
  const urlParts: RequestOptions = {
    protocol: 'http:',
    host: 'dogs.are.great',
    method: 'GET',
    path: '/yay/',
    port: 1231,
  };
  const queryString = '?furry=yes&funny=very';

  it('accepts a url string', () => {
    expect(extractUrl(urlString)).toBe(urlString);
  });

  it('accepts a http.RequestOptions object and returns a string with everything in the right place', () => {
    expect(extractUrl(urlParts)).toBe('http://dogs.are.great:1231/yay/');
  });

  it('strips query string from url string', () => {
    const urlWithQueryString = `${urlString}${queryString}`;
    expect(extractUrl(urlWithQueryString)).toBe(urlString);
  });

  it('strips query string from path in http.RequestOptions object', () => {
    const urlPartsWithQueryString = { ...urlParts, path: `${urlParts.path}${queryString}` };
    expect(extractUrl(urlPartsWithQueryString)).toBe(urlString);
  });
}); // end describe('extractUrl()')
