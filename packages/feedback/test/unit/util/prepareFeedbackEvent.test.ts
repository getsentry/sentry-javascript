import { setCurrentClient } from '@sentry/core';
import { getCurrentScope } from '@sentry/core';
import type { FeedbackEvent, Scope } from '@sentry/types';

import { prepareFeedbackEvent } from '../../../src/util/prepareFeedbackEvent';
import { TestClient, getDefaultClientOptions } from '../../utils/TestClient';

describe('Unit | util | prepareFeedbackEvent', () => {
  let client: TestClient;
  let scope: Scope;

  beforeEach(() => {
    client = new TestClient(getDefaultClientOptions());
    setCurrentClient(client);
    client.init();
    scope = getCurrentScope();
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
      type: 'feedback',
      contexts: {
        feedback: {
          contact_email: 'test@test.com',
          message: 'looks great!',
          replay_id: replayId,
          url: 'https://sentry.io/',
        },
        replay: {
          error_sample_rate: 1.0,
          session_sample_rate: 0.1,
        },
      },
    };

    const feedbackEvent = await prepareFeedbackEvent({ scope, client, event });

    expect(feedbackEvent).toEqual({
      timestamp: 1670837008.634,
      event_id: 'feedback-ID',
      platform: 'javascript',
      environment: 'production',
      contexts: {
        feedback: {
          contact_email: 'test@test.com',
          message: 'looks great!',
          replay_id: replayId,
          url: 'https://sentry.io/',
        },
        replay: {
          error_sample_rate: 1.0,
          session_sample_rate: 0.1,
        },
      },
      sdkProcessingMetadata: expect.any(Object),
      breadcrumbs: undefined,
      type: 'feedback',
    });
  });
});
