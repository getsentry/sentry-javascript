import { parseFetchArgs } from '../../../src/utils-hoist/instrument/fetch';

describe('instrument > parseFetchArgs', () => {
  const data = { name: 'Test' };

  it.each([
    ['string URL only', ['http://example.com'], { method: 'GET', url: 'http://example.com', body: null }],
    ['URL object only', [new URL('http://example.com')], { method: 'GET', url: 'http://example.com/', body: null }],
    ['Request URL only', [{ url: 'http://example.com' }], { method: 'GET', url: 'http://example.com', body: null }],
    [
      'Request URL & method only',
      [{ url: 'http://example.com', method: 'post' }],
      { method: 'POST', url: 'http://example.com', body: null },
    ],
    [
      'string URL & options',
      ['http://example.com', { method: 'post', body: JSON.stringify(data) }],
      { method: 'POST', url: 'http://example.com', body: '{"name":"Test"}' },
    ],
    [
      'URL object & options',
      [new URL('http://example.com'), { method: 'post', body: JSON.stringify(data) }],
      { method: 'POST', url: 'http://example.com/', body: '{"name":"Test"}' },
    ],
    [
      'Request URL & options',
      [{ url: 'http://example.com' }, { method: 'post', body: JSON.stringify(data) }],
      { method: 'POST', url: 'http://example.com', body: '{"name":"Test"}' },
    ],
  ])('%s', (_name, args, expected) => {
    const actual = parseFetchArgs(args as unknown[]);

    expect(actual).toEqual(expected);
  });
});
