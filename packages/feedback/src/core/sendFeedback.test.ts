import { getClient } from '@sentry/core';

import { mockSdk } from './mockSdk';
import { sendFeedback } from './sendFeedback';

describe('sendFeedback', () => {
  it('sends feedback', async () => {
    mockSdk();
    const mockTransport = jest.spyOn(getClient()!.getTransport()!, 'send');

    await sendFeedback({
      name: 'doe',
      email: 're@example.org',
      message: 'mi',
    });
    expect(mockTransport).toHaveBeenCalledWith([
      { event_id: expect.any(String), sent_at: expect.any(String) },
      [
        [
          { type: 'feedback' },
          {
            breadcrumbs: undefined,
            contexts: {
              feedback: {
                contact_email: 're@example.org',
                message: 'mi',
                name: 'doe',
                replay_id: undefined,
                source: 'api',
                url: 'http://localhost/',
              },
            },
            level: 'info',
            environment: 'production',
            event_id: expect.any(String),
            platform: 'javascript',
            timestamp: expect.any(Number),
            type: 'feedback',
          },
        ],
      ],
    ]);
  });
});
