import { isExpired } from '../../../src/util/isExpired';

describe('Unit | util | isExpired', () => {
  it('is expired', function () {
    expect(isExpired(0, 150, 200)).toBe(true); //  expired at ts = 150
  });

  it('is not expired', function () {
    expect(isExpired(100, 150, 200)).toBe(false); //  expires at ts >= 250
  });

  it('is expired when target time reaches exactly the expiry time', function () {
    expect(isExpired(100, 150, 250)).toBe(true); //  expires at ts >= 250
  });

  it('never expires if expiry is 0', function () {
    expect(isExpired(300, 0, 200)).toBe(false);
    expect(isExpired(0, 0, 200)).toBe(false);
  });

  it('always expires if expiry is < 0', function () {
    expect(isExpired(300, -1, 200)).toBe(true);
    expect(isExpired(0, -1, 200)).toBe(true);
  });
});
