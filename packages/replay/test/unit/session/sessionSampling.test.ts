import { getSessionSampleType, makeSession } from '../../../src/session/Session';

describe('Unit | session | sessionSampling', () => {
  it('does not sample', function () {
    const newSession = makeSession({
      sampled: getSessionSampleType(0, 0),
    });

    expect(newSession.sampled).toBe(false);
  });

  it('samples using `sessionSampleRate`', function () {
    const newSession = makeSession({
      sampled: getSessionSampleType(1.0, 0),
    });

    expect(newSession.sampled).toBe('session');
  });

  it('samples using `errorSampleRate`', function () {
    const newSession = makeSession({
      sampled: getSessionSampleType(0, 1),
    });

    expect(newSession.sampled).toBe('error');
  });

  it('does not run sampling function if existing session was sampled', function () {
    const newSession = makeSession({
      sampled: 'session',
    });

    expect(newSession.sampled).toBe('session');
  });
});
