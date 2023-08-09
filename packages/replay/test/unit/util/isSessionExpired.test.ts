import { MAX_REPLAY_DURATION } from '../../../src/constants';
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
    expect(
      isSessionExpired(createSession(), {
        maxReplayDuration: MAX_REPLAY_DURATION,
        sessionIdleExpire: 100,
        targetTime: 200,
      }),
    ).toBe(true); // Session expired at ts = 100
  });

  it('session last activity is not older than expiry time', function () {
    expect(
      isSessionExpired(createSession({ lastActivity: 100 }), {
        maxReplayDuration: MAX_REPLAY_DURATION,
        sessionIdleExpire: 150,
        targetTime: 200,
      }),
    ).toBe(false); // Session expires at ts >= 250
  });

  it('session age is not older than max session life', function () {
    expect(
      isSessionExpired(createSession(), {
        maxReplayDuration: MAX_REPLAY_DURATION,
        sessionIdleExpire: 1_800_000,
        targetTime: 50_000,
      }),
    ).toBe(false);
  });

  it('session age is older than max session life', function () {
    expect(
      isSessionExpired(createSession(), {
        maxReplayDuration: MAX_REPLAY_DURATION,
        sessionIdleExpire: 1_800_000,
        targetTime: 1_800_001,
      }),
    ).toBe(true); // Session expires at ts >= 1_800_000
  });
});
