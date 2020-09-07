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
  const fragment = '#adoptnotbuy';

  it('accepts a url string', () => {
    expect(extractUrl(urlString)).toBe(urlString);
  });

  it('accepts a http.RequestOptions object and returns a string with everything in the right place', () => {
    expect(extractUrl(urlParts)).toBe('http://dogs.are.great:1231/yay/');
  });

  it("by default doesn't strip query string from url string", () => {
    const urlWithQueryString = `${urlString}${queryString}`;
    expect(extractUrl(urlWithQueryString)).toBe(urlWithQueryString);
  });

  it("by default doesn't strip query string from path in http.RequestOptions object", () => {
    const urlPartsWithQueryString = { ...urlParts, path: `${urlParts.path}${queryString}` };
    const urlWithQueryString = `${urlString}${queryString}`;

    expect(extractUrl(urlPartsWithQueryString)).toBe(urlWithQueryString);
  });

  it("by default doesn't strip fragment from url string", () => {
    const urlWithFragment = `${urlString}${fragment}`;
    expect(extractUrl(urlWithFragment)).toBe(urlWithFragment);
  });

  it("by default doesn't strip fragment from path in http.RequestOptions object", () => {
    const urlPartsWithFragment = { ...urlParts, path: `${urlParts.path}${fragment}` };
    const urlWithFragment = `${urlString}${fragment}`;

    expect(extractUrl(urlPartsWithFragment)).toBe(urlWithFragment);
  });

  it("by default doesn't strip query string and fragment from url string", () => {
    const urlWithQueryStringAndFragment = `${urlString}${queryString}${fragment}`;
    expect(extractUrl(urlWithQueryStringAndFragment)).toBe(urlWithQueryStringAndFragment);
  });

  it("by default doesn't strip query string and fragment from path in http.RequestOptions object", () => {
    const urlPartsWithQueryStringAndFragment = { ...urlParts, path: `${urlParts.path}${queryString}${fragment}` };
    const urlWithQueryStringAndFragment = `${urlString}${queryString}${fragment}`;

    expect(extractUrl(urlPartsWithQueryStringAndFragment)).toBe(urlWithQueryStringAndFragment);
  });

  it('strips query string from url string when asked', () => {
    const urlWithQueryString = `${urlString}${queryString}`;
    expect(extractUrl(urlWithQueryString, true)).toBe(urlString);
  });

  it('strips query string from path in http.RequestOptions object when asked', () => {
    const urlPartsWithQueryString = { ...urlParts, path: `${urlParts.path}${queryString}` };
    expect(extractUrl(urlPartsWithQueryString, true)).toBe(urlString);
  });

  it('strips fragment from url string when asked', () => {
    const urlWithFragment = `${urlString}${fragment}`;
    expect(extractUrl(urlWithFragment, true)).toBe(urlString);
  });

  it('strips fragment from path in http.RequestOptions object when asked', () => {
    const urlPartsWithFragment = { ...urlParts, path: `${urlParts.path}${fragment}` };
    expect(extractUrl(urlPartsWithFragment, true)).toBe(urlString);
  });

  it('strips query string and fragment from url string when asked', () => {
    const urlWithQueryStringAndFragment = `${urlString}${queryString}${fragment}`;
    expect(extractUrl(urlWithQueryStringAndFragment, true)).toBe(urlString);
  });

  it('strips query string and fragment from path in http.RequestOptions object when asked', () => {
    const urlPartsWithQueryStringAndFragment = { ...urlParts, path: `${urlParts.path}${queryString}${fragment}` };
    expect(extractUrl(urlPartsWithQueryStringAndFragment, true)).toBe(urlString);
  });
}); // end describe('extractUrl()')
