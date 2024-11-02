import { parseFetchArgs, parseFetchPayload } from '../../src/instrument/fetch';

describe('instrument > parseFetchArgs', () => {
  it.each([
    ['string URL only', ['http://example.com'], { method: 'GET', url: 'http://example.com' }],
    ['URL object only', [new URL('http://example.com')], { method: 'GET', url: 'http://example.com/' }],
    ['Request URL only', [{ url: 'http://example.com' }], { method: 'GET', url: 'http://example.com' }],
    [
      'Request URL & method only',
      [{ url: 'http://example.com', method: 'post' }],
      { method: 'POST', url: 'http://example.com' },
    ],
    ['string URL & options', ['http://example.com', { method: 'post' }], { method: 'POST', url: 'http://example.com' }],
    [
      'URL object & options',
      [new URL('http://example.com'), { method: 'post' }],
      { method: 'POST', url: 'http://example.com/' },
    ],
    [
      'Request URL & options',
      [{ url: 'http://example.com' }, { method: 'post' }],
      { method: 'POST', url: 'http://example.com' },
    ],
  ])('%s', (_name, args, expected) => {
    const actual = parseFetchArgs(args as unknown[]);

    expect(actual).toEqual(expected);
  });
});

describe('instrument > parseFetchPayload', () => {
  const data = [1, 2, 3];
  const jsonData = '{"data":[1,2,3]}';

  it.each([
    ['string URL only', ['http://example.com'], undefined],
    ['URL object only', [new URL('http://example.com')], undefined],
    ['Request URL only', [{ url: 'http://example.com' }], undefined],
    [
      'Request URL & method only',
      [{ url: 'http://example.com', method: 'post', body: JSON.stringify({ data }) }],
      jsonData,
    ],
    ['string URL & options', ['http://example.com', { method: 'post', body: JSON.stringify({ data }) }], jsonData],
    [
      'URL object & options',
      [new URL('http://example.com'), { method: 'post', body: JSON.stringify({ data }) }],
      jsonData,
    ],
    [
      'Request URL & options',
      [{ url: 'http://example.com' }, { method: 'post', body: JSON.stringify({ data }) }],
      jsonData,
    ],
  ])('%s', (_name, args, expected) => {
    const actual = parseFetchPayload(args as unknown[]);

    expect(actual).toEqual(expected);
  });
});
