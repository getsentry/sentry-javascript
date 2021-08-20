/* eslint-disable @typescript-eslint/no-explicit-any */
import { base64ToUnicode, unicodeToBase64 } from '@sentry/utils';
import { expect } from 'chai';

// See https://tools.ietf.org/html/rfc4648#section-4 for base64 spec
// eslint-disable-next-line no-useless-escape
const BASE64_REGEX = /([a-zA-Z0-9+/]{4})*(|([a-zA-Z0-9+/]{3}=)|([a-zA-Z0-9+/]{2}==))/;

// NOTE: These tests are copied (and adapted for chai syntax) from `string.test.ts` in `@sentry/utils`. The
// base64-conversion functions have a different implementation in browser and node, so they're copied here to prove they
// work in a real live browser. If you make changes here, make sure to also port them over to that copy.
describe('base64ToUnicode/unicodeToBase64', () => {
  const unicodeString = 'Dogs are great!';
  const base64String = 'RG9ncyBhcmUgZ3JlYXQh';

  it('converts to valid base64', () => {
    expect(BASE64_REGEX.test(unicodeToBase64(unicodeString))).to.be.true;
  });

  it('works as expected (and conversion functions are inverses)', () => {
    expect(unicodeToBase64(unicodeString)).to.equal(base64String);
    expect(base64ToUnicode(base64String)).to.equal(unicodeString);
  });

  it('can handle and preserve multi-byte characters in original string', () => {
    ['🐶', 'Καλό κορίτσι, Μάιζεϊ!', 'Of margir hundar! Ég geri ráð fyrir að ég þurfi stærra rúm.'].forEach(orig => {
      expect(() => {
        unicodeToBase64(orig);
      }).not.to.throw;
      expect(base64ToUnicode(unicodeToBase64(orig))).to.equal(orig);
    });
  });

  it('throws an error when given invalid input', () => {
    expect(() => {
      unicodeToBase64(null as any);
    }).to.throw('Unable to convert to base64');
    expect(() => {
      unicodeToBase64(undefined as any);
    }).to.throw('Unable to convert to base64');
    expect(() => {
      unicodeToBase64({} as any);
    }).to.throw('Unable to convert to base64');

    expect(() => {
      base64ToUnicode(null as any);
    }).to.throw('Unable to convert from base64');
    expect(() => {
      base64ToUnicode(undefined as any);
    }).to.throw('Unable to convert from base64');
    expect(() => {
      base64ToUnicode({} as any);
    }).to.throw('Unable to convert from base64');
    expect(() => {
      // the exclamation point makes this invalid base64
      base64ToUnicode('Dogs are great!');
    }).to.throw('Unable to convert from base64');
  });
});
