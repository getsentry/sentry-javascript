import jestMock from 'jest-mock';
import { instrumentXHR, instrumentDOM, parseFetchArgs } from '../src/instrument';

//@ts-ignore
jestMock.mock('../src/worldwide', () => ({
  //Return an empty object with undefined properties
  getGlobalObject: () => ({
    document: undefined,
    XMLHttpRequest: undefined,
  }),
}));

describe('instrument', () => {
  describe('polyfilling', () => {
    it('does not instrumentXHR if no XMLHttpRequest detected', () => {
      expect(instrumentXHR()).not.toThrow();
    });
    it('does not instrumentDOM if no document detected', () => {
      expect(instrumentDOM()).not.toThrow();
    });
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
