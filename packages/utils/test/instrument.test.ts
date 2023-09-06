import { instrumentDOM, instrumentXHR, parseFetchArgs } from '../src/instrument';

jest.mock('../src/worldwide', () => ({
  // Return an empty object with undefined properties
  getGlobalObject: () => ({
    document: undefined,
    XMLHttpRequest: undefined,
  }),
}));

describe('instrument', () => {
  it('instrumentXHR() does not throw if XMLHttpRequest is a key on window but not defined', () => {
    expect(instrumentXHR).not.toThrow();
  });

  it('instrumentDOM() does not throw if XMLHttpRequest is a key on window but not defined', () => {
    expect(instrumentDOM).not.toThrow();
  });

  describe('parseFetchArgs', () => {
    it.each([
      ['string URL only', ['http://example.com'], { method: 'GET', url: 'http://example.com' }],
      ['URL object only', [new URL('http://example.com')], { method: 'GET', url: 'http://example.com/' }],
      ['Request URL only', [{ url: 'http://example.com' }], { method: 'GET', url: 'http://example.com' }],
      [
        'Request URL & method only',
        [{ url: 'http://example.com', method: 'post' }],
        { method: 'POST', url: 'http://example.com' },
      ],
      [
        'string URL & options',
        ['http://example.com', { method: 'post' }],
        { method: 'POST', url: 'http://example.com' },
      ],
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
});
