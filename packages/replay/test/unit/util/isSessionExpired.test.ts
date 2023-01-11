import { makeSession } from '../../../src/session/Session';
import { isSessionExpired } from '../../../src/util/isSessionExpired';

function createSession(extra?: Record<string, any>) {
  return makeSession({
    // Setting started/lastActivity to 0 makes it use the default, which is `Date.now()`
    started: 1,
    lastActivity: 1,
    segmentId: 0,
    sampled: 'session',
    ...extra,
  });
}

describe('Unit | util | isSessionExpired', () => {
  it('session last activity is older than expiry time', function () {
    expect(isSessionExpired(createSession(), 100, 200)).toBe(true); // Session expired at ts = 100
  });

  it('session last activity is not older than expiry time', function () {
    expect(isSessionExpired(createSession({ lastActivity: 100 }), 150, 200)).toBe(false); // Session expires at ts >= 250
  });

  it('session age is not older than max session life', function () {
    expect(isSessionExpired(createSession(), 1_800_000, 50_000)).toBe(false);
  });

  it('session age is older than max session life', function () {
    expect(isSessionExpired(createSession(), 1_800_000, 1_800_001)).toBe(true); // Session expires at ts >= 1_800_000
  });
});
