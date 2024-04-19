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
      {
        event_id: expect.any(String),
        sent_at: expect.any(String),
        trace: expect.anything(),
      },
      [
        [
          { type: 'feedback' },
          {
            breadcrumbs: undefined,
            contexts: {
              trace: {
                parent_span_id: undefined,
                span_id: expect.any(String),
                trace_id: expect.any(String),
              },
              feedback: {
                contact_email: 're@example.org',
                message: 'mi',
                name: 'doe',
                source: 'api',
                url: 'http://localhost/',
              },
            },
            level: 'info',
            environment: 'production',
            event_id: expect.any(String),
            // TODO: Why is there no platform here?
            timestamp: expect.any(Number),
            type: 'feedback',
          },
        ],
      ],
    ]);
  });
});
