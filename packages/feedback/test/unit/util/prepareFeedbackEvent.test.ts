import type { Hub, Scope } from '@sentry/core';
import { getCurrentHub } from '@sentry/core';
import type { Client } from '@sentry/types';

import type { FeedbackEvent } from '../../../src/types';
import { prepareFeedbackEvent } from '../../../src/util/prepareFeedbackEvent';
import { getDefaultClientOptions, TestClient } from '../../utils/TestClient';

describe('Unit | util | prepareFeedbackEvent', () => {
  let hub: Hub;
  let client: Client;
  let scope: Scope;

  beforeEach(() => {
    hub = getCurrentHub();
    client = new TestClient(getDefaultClientOptions());
    hub.bindClient(client);

    client = hub.getClient()!;
    scope = hub.getScope()!;

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
    expect(client).toBeDefined();
    expect(scope).toBeDefined();

    const replayId = 'replay-ID';
    const event: FeedbackEvent = {
      timestamp: 1670837008.634,
      event_id: 'feedback-ID',
      feedback: {
        contact_email: 'test@test.com',
        message: 'looks great!',
        replay_id: replayId,
        url: 'https://sentry.io/',
      },
      contexts: {
        replay: {
          error_sample_rate: 1.0,
          session_sample_rate: 0.1,
        },
      },
    };

    const feedbackEvent = await prepareFeedbackEvent({ scope, client, event });

    expect(client.getSdkMetadata).toHaveBeenCalledTimes(1);

    expect(feedbackEvent).toEqual({
      timestamp: 1670837008.634,
      event_id: 'feedback-ID',
      feedback: {
        contact_email: 'test@test.com',
        message: 'looks great!',
        replay_id: replayId,
        url: 'https://sentry.io/',
      },
      platform: 'javascript',
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
