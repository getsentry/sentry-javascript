import { getClient, getCurrentScope, setCurrentClient } from '@sentry/core';
import type { ReplayEvent } from '@sentry/types';

import { REPLAY_EVENT_NAME } from '../../../src/constants';
import { prepareReplayEvent } from '../../../src/util/prepareReplayEvent';
import { TestClient, getDefaultClientOptions } from '../../utils/TestClient';

describe('Unit | util | prepareReplayEvent', () => {
  beforeEach(() => {
    const client = new TestClient(getDefaultClientOptions());
    setCurrentClient(client);
    client.init();

    jest.spyOn(client, 'getSdkMetadata').mockImplementation(() => {
      return {
        sdk: {
          name: 'sentry.javascript.testSdk',
          version: '1.0.0',
        },
      };
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('works', async () => {
    const client = getClient()!;
    const scope = getCurrentScope()!;

    expect(client).toBeDefined();
    expect(scope).toBeDefined();

    const replayId = 'replay-ID';
    const event: ReplayEvent = {
      type: REPLAY_EVENT_NAME,
      timestamp: 1670837008.634,
      error_ids: ['error-ID'],
      trace_ids: ['trace-ID'],
      urls: ['https://sentry.io/'],
      replay_id: replayId,
      replay_type: 'session',
      segment_id: 3,
      contexts: {
        replay: {
          error_sample_rate: 1.0,
          session_sample_rate: 0.1,
        },
      },
    };

    const replayEvent = await prepareReplayEvent({ scope, client, replayId, event });

    expect(client.getSdkMetadata).toHaveBeenCalledTimes(1);

    expect(replayEvent).toEqual({
      type: 'replay_event',
      timestamp: 1670837008.634,
      error_ids: ['error-ID'],
      trace_ids: ['trace-ID'],
      urls: ['https://sentry.io/'],
      replay_id: 'replay-ID',
      replay_type: 'session',
      segment_id: 3,
      platform: 'javascript',
      event_id: 'replay-ID',
      environment: 'production',
      contexts: {
        replay: {
          error_sample_rate: 1.0,
          session_sample_rate: 0.1,
        },
      },
      sdk: {
        name: 'sentry.javascript.testSdk',
        version: '1.0.0',
      },
      sdkProcessingMetadata: expect.any(Object),
      breadcrumbs: undefined,
    });
  });
});
