import { Session } from '../../../src/session/Session';
import { isSessionExpired } from '../../../src/util/isSessionExpired';

function createSession(extra?: Record<string, any>) {
  return new Session(
    {
      started: 0,
      lastActivity: 0,
      segmentId: 0,
      ...extra,
    },
    { stickySession: false, sessionSampleRate: 1.0, errorSampleRate: 0 },
  );
}

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
  expect(isSessionExpired(createSession(), 1_800_000, 1_800_000)).toBe(true); // Session expires at ts >= 1_800_000
});
