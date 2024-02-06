import { getCurrentScope } from '@sentry/core';
import { replayIntegration } from '../../../src/integration';
import { getReplay } from '../../../src/util/getReplay';
import { TestClient, getDefaultClientOptions } from '../../utils/TestClient';

describe('getReplay', () => {
  beforeEach(() => {
    getCurrentScope().setClient(undefined);
  });

  it('works without a client', () => {
    const actual = getReplay();
    expect(actual).toBeUndefined();
  });

  it('works with a client without Replay', () => {
    const client = new TestClient(getDefaultClientOptions());
    getCurrentScope().setClient(client);

    const actual = getReplay();
    expect(actual).toBeUndefined();
  });

  it('works with a client with Replay', () => {
    const replay = replayIntegration();
    const client = new TestClient(
      getDefaultClientOptions({
        integrations: [replay],
        replaysOnErrorSampleRate: 0,
        replaysSessionSampleRate: 0,
      }),
    );
    getCurrentScope().setClient(client);
    client.init();

    const actual = getReplay();
    expect(actual).toBe(replay);
    expect(replay.getReplayId()).toBe(undefined);
  });
});
