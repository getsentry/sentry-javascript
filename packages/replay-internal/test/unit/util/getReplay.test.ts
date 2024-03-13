import { getCurrentScope } from '@sentry/core';
import { replayIntegration } from '../../../src/integration';
import { getReplay } from '../../../src/util/getReplay';
import { getDefaultClientOptions, init } from '../../utils/TestClient';

describe('getReplay', () => {
  beforeEach(() => {
    getCurrentScope().setClient(undefined);
  });

  it('works without a client', () => {
    const actual = getReplay();
    expect(actual).toBeUndefined();
  });

  it('works with a client without Replay', () => {
    init(
      getDefaultClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
      }),
    );

    const actual = getReplay();
    expect(actual).toBeUndefined();
  });

  it('works with a client with Replay', () => {
    const replay = replayIntegration();
    init(
      getDefaultClientOptions({
        integrations: [replay],
        replaysOnErrorSampleRate: 0,
        replaysSessionSampleRate: 0,
      }),
    );

    const actual = getReplay();
    expect(actual).toBeDefined();
    expect(actual === replay).toBe(true);
    expect(replay.getReplayId()).toBe(undefined);
  });
});
