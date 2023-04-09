import { TextEncoder } from 'util';

import { getBodySize, parseContentLengthHeader } from '../../../../src/coreHandlers/util/networkUtils';

jest.useFakeTimers();

describe('Unit | coreHandlers | util | networkUtils', () => {
  describe('parseContentLengthHeader()', () => {
    it.each([
      [undefined, undefined],
      [null, undefined],
      ['', undefined],
      ['12', 12],
      ['abc', undefined],
    ])('works with %s header value', (headerValue, size) => {
      expect(parseContentLengthHeader(headerValue)).toBe(size);
    });
  });

  describe('getBodySize()', () => {
    const textEncoder = new TextEncoder();

    it('works with empty body', () => {
      expect(getBodySize(undefined, textEncoder)).toBe(undefined);
      expect(getBodySize(null, textEncoder)).toBe(undefined);
      expect(getBodySize('', textEncoder)).toBe(undefined);
    });

    it('works with string body', () => {
      expect(getBodySize('abcd', textEncoder)).toBe(4);
      // Emojis are correctly counted as mutliple characters
      expect(getBodySize('With emoji: 😈', textEncoder)).toBe(16);
    });

    it('works with URLSearchParams', () => {
      const params = new URLSearchParams();
      params.append('name', 'Jane');
      params.append('age', '42');
      params.append('emoji', '😈');

      expect(getBodySize(params, textEncoder)).toBe(35);
    });

    it('works with FormData', () => {
      const formData = new FormData();
      formData.append('name', 'Jane');
      formData.append('age', '42');
      formData.append('emoji', '😈');

      expect(getBodySize(formData, textEncoder)).toBe(35);
    });

    it('works with Blob', () => {
      const blob = new Blob(['<html>Hello world: 😈</html>'], { type: 'text/html' });

      expect(getBodySize(blob, textEncoder)).toBe(30);
    });

    it('works with ArrayBuffer', () => {
      const arrayBuffer = new ArrayBuffer(8);

      expect(getBodySize(arrayBuffer, textEncoder)).toBe(8);
    });
  });
});
