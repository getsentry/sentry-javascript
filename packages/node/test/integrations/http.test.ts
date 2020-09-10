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

  it('accepts a url string', () => {
    expect(extractUrl(urlString)).toBe(urlString);
  });

  it('accepts a http.RequestOptions object and returns a string with everything in the right place', () => {
    expect(extractUrl(urlParts)).toBe(urlString);
  });
});
