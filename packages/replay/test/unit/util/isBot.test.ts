import { isBot } from '../../../src/util/isBot';

describe('isBot', () => {
  it('finds google bot user agent', () => {
    expect(
      isBot(
        'Mozilla/5.0 (Linux; Android 5.0; SM-G920A) AppleWebKit (KHTML, like Gecko) Chrome Mobile Safari (compatible; AdsBot-Google-Mobile; +http://www.google.com/mobile/adsbot.html)',
      ),
    ).toBe(true);
  });

  it('allows other user agents', () => {
    expect(
      isBot('Mozilla/5.0 (Linux; Android 5.0; SM-G920A) AppleWebKit (KHTML, like Gecko) Chrome Mobile Safari'),
    ).toBe(false);
  });
});
