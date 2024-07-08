import { expect, test } from '@playwright/test';
import { waitForEnvelopeItem } from '@sentry-internal/test-utils';

test('Cron job triggers send of in_progress envelope', async () => {
  const inProgressEnvelopePromise = waitForEnvelopeItem('nestjs', envelope => {
    return envelope[0].type === 'check_in';
  });

  const inProgressEnvelope = await inProgressEnvelopePromise;

  expect(inProgressEnvelope[1]).toEqual({
    check_in_id: expect.any(String),
    monitor_slug: 'test-cron-slug',
    status: 'in_progress',
    environment: 'qa',
    monitor_config: {
      schedule: {
        type: 'crontab',
        value: '* * * * *',
      },
    },
    contexts: {
      trace: {
        span_id: expect.any(String),
        trace_id: expect.any(String),
      },
    },
  });
});
