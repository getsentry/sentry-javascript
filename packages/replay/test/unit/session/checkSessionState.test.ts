import { checkSessionState } from '../../../src/session/checkSessionState';
import { makeSession } from '../../../src/session/Session';
import type { Session, Timeouts } from '../../../src/types';

describe('Unit | session | checkSessionState', () => {
  const timeouts: Timeouts = {
    sessionIdlePause: 10_000,
    maxSessionLife: 10_000,
  };

  it('works for a regular session', () => {
    const onPause = jest.fn();
    const ensureResumed = jest.fn();
    const onEnd = jest.fn();
    const onContinue = jest.fn();

    const session: Session = makeSession({ sampled: 'session' });

    checkSessionState(session, 'session', timeouts, {
      onPause,
      ensureResumed,
      onEnd,
      onContinue,
    });

    expect(onPause).not.toHaveBeenCalled();
    expect(ensureResumed).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('pauses an idle session', () => {
    const onPause = jest.fn();
    const ensureResumed = jest.fn();
    const onEnd = jest.fn();
    const onContinue = jest.fn();

    const session: Session = makeSession({ sampled: 'session', lastActivity: Date.now() - 20_000 });

    const timeouts: Timeouts = {
      sessionIdlePause: 10_000,
      maxSessionLife: 100_000,
    };

    checkSessionState(session, 'session', timeouts, {
      onPause,
      ensureResumed,
      onEnd,
      onContinue,
    });

    expect(onPause).toHaveBeenCalledTimes(1);
    expect(ensureResumed).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('does not pause an idle buffer session', () => {
    const onPause = jest.fn();
    const ensureResumed = jest.fn();
    const onEnd = jest.fn();
    const onContinue = jest.fn();

    const session: Session = makeSession({ sampled: 'buffer', lastActivity: Date.now() - 20_000 });

    const timeouts: Timeouts = {
      sessionIdlePause: 10_000,
      maxSessionLife: 100_000,
    };

    checkSessionState(session, 'buffer', timeouts, {
      onPause,
      ensureResumed,
      onEnd,
      onContinue,
    });

    expect(onPause).not.toHaveBeenCalled();
    expect(ensureResumed).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
    expect(onContinue).toHaveBeenCalled();
  });

  it('ends a too long session', () => {
    const onPause = jest.fn();
    const ensureResumed = jest.fn();
    const onEnd = jest.fn();
    const onContinue = jest.fn();

    const session: Session = makeSession({ sampled: 'session', started: Date.now() - 20_000 });

    checkSessionState(session, 'session', timeouts, {
      onPause,
      ensureResumed,
      onEnd,
      onContinue,
    });

    expect(onPause).not.toHaveBeenCalled();
    expect(ensureResumed).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('does not end a too long buffer session', () => {
    const onPause = jest.fn();
    const ensureResumed = jest.fn();
    const onEnd = jest.fn();
    const onContinue = jest.fn();

    const session: Session = makeSession({ sampled: 'buffer', started: Date.now() - 20_000 });

    checkSessionState(session, 'buffer', timeouts, {
      onPause,
      ensureResumed,
      onEnd,
      onContinue,
    });

    expect(onPause).not.toHaveBeenCalled();
    expect(ensureResumed).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
    expect(onContinue).toHaveBeenCalled();
  });

  it('uses recordingMode over session.sampled', () => {
    const onPause = jest.fn();
    const ensureResumed = jest.fn();
    const onEnd = jest.fn();
    const onContinue = jest.fn();

    const session: Session = makeSession({ sampled: 'buffer', started: Date.now() - 20_000 });

    // A session with sampled=buffer can be in `session` mode after an error has been captured
    // In this case, we need to use the recordingMode `session` for decisions, not the session.sampled
    checkSessionState(session, 'session', timeouts, {
      onPause,
      ensureResumed,
      onEnd,
      onContinue,
    });

    expect(onPause).not.toHaveBeenCalled();
    expect(ensureResumed).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });
});
