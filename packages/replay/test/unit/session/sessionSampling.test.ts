import { makeSession } from '../../../src/session/Session';
import { getSessionSampleType } from '../../../src/session/createSession';

describe('Unit | session | sessionSampling', () => {
  it('does not sample', function () {
    const newSession = makeSession({
      sampled: getSessionSampleType(0, false),
    });

    expect(newSession.sampled).toBe(false);
  });

  it('samples using `sessionSampleRate`', function () {
    const newSession = makeSession({
      sampled: getSessionSampleType(1.0, false),
    });

    expect(newSession.sampled).toBe('session');
  });

  it('samples using `errorSampleRate`', function () {
    const newSession = makeSession({
      sampled: getSessionSampleType(0, true),
    });

    expect(newSession.sampled).toBe('buffer');
  });

  it('does not run sampling function if existing session was sampled', function () {
    const newSession = makeSession({
      sampled: 'session',
    });

    expect(newSession.sampled).toBe('session');
  });
});
