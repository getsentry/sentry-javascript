import type { ReplayEvent } from '@sentry/core';
import { getClient, getCurrentScope, setCurrentClient } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPLAY_EVENT_NAME } from '../../../src/constants';
import { prepareReplayEvent } from '../../../src/util/prepareReplayEvent';
import { getDefaultClientOptions, TestClient } from '../../utils/TestClient';

describe('Unit | util | prepareReplayEvent', () => {
  beforeEach(() => {
    const client = new TestClient(getDefaultClientOptions());
    setCurrentClient(client);
    client.init();

    vi.spyOn(client, 'getSdkMetadata').mockImplementation(() => {
      return {
        sdk: {
          name: 'sentry.javascript.testSdk',
          version: '1.0.0',
        },
      };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('works', async () => {
    const client = getClient()!;
    const scope = getCurrentScope();

    expect(client).toBeDefined();

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

  it('emits hooks', async () => {
    const client = getClient()!;
    const scope = getCurrentScope().clone();

    const preprocessEvent = vi.fn();
    const postprocessEvent = vi.fn();

    const removeHook1 = client.on('preprocessEvent', preprocessEvent);
    const removeHook2 = client.on('postprocessEvent', postprocessEvent);

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

    const processedEvent = {
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
    };

    await prepareReplayEvent({ scope, client, replayId, event });

    expect(preprocessEvent).toHaveBeenCalledTimes(1);
    expect(preprocessEvent).toHaveBeenCalledWith(event, {
      event_id: 'replay-ID',
      integrations: [],
    });

    expect(postprocessEvent).toHaveBeenCalledTimes(1);
    expect(postprocessEvent).toHaveBeenCalledWith(processedEvent, {
      event_id: 'replay-ID',
      integrations: [],
    });

    removeHook1();
    removeHook2();
  });
});
