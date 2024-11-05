import { expect, test } from '@playwright/test';
import { waitForEnvelopeItem, waitForError } from '@sentry-internal/test-utils';

test('Cron job triggers send of in_progress envelope', async ({ baseURL }) => {
  const inProgressEnvelopePromise = waitForEnvelopeItem('nestjs-basic', envelope => {
    return (
      envelope[0].type === 'check_in' &&
      envelope[1]['monitor_slug'] === 'test-cron-slug' &&
      envelope[1]['status'] === 'in_progress'
    );
  });

  const okEnvelopePromise = waitForEnvelopeItem('nestjs-basic', envelope => {
    return (
      envelope[0].type === 'check_in' &&
      envelope[1]['monitor_slug'] === 'test-cron-slug' &&
      envelope[1]['status'] === 'ok'
    );
  });

  const inProgressEnvelope = await inProgressEnvelopePromise;
  const okEnvelope = await okEnvelopePromise;

  expect(inProgressEnvelope[1]).toEqual(
    expect.objectContaining({
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
    }),
  );

  expect(okEnvelope[1]).toEqual(
    expect.objectContaining({
      check_in_id: expect.any(String),
      monitor_slug: 'test-cron-slug',
      status: 'ok',
      environment: 'qa',
      duration: expect.any(Number),
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
        },
      },
    }),
  );

  // kill cron so tests don't get stuck
  await fetch(`${baseURL}/kill-test-cron/test-cron-job`);
});

test('Sends exceptions to Sentry on error in cron job', async ({ baseURL }) => {
  const errorEventPromise = waitForError('nestjs-basic', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'Test error from cron job';
  });

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('Test error from cron job');
  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.any(String),
    span_id: expect.any(String),
  });

  // kill cron so tests don't get stuck
  await fetch(`${baseURL}/kill-test-cron/test-cron-error`);
});
