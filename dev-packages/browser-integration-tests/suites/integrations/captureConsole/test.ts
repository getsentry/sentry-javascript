import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../utils/helpers';

sentryTest('it captures console messages correctly', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const [, events] = await Promise.all([page.goto(url), getMultipleSentryEnvelopeRequests<Event>(page, 7)]);

  expect(events).toHaveLength(7);

  const logEvent = events.find(event => event.message === 'console log');
  const warnEvent = events.find(event => event.message === 'console warn');
  const infoEvent = events.find(event => event.message === 'console info');
  const errorEvent = events.find(event => event.message === 'console error');
  const traceEvent = events.find(event => event.message === 'console trace');
  const errorWithErrorEvent = events.find(
    event => event.exception && event.exception.values?.[0].value === 'console error with error object',
  );
  const traceWithErrorEvent = events.find(
    event => event.exception && event.exception.values?.[0].value === 'console trace with error object',
  );

  expect(logEvent).toEqual(
    expect.objectContaining({
      level: 'log',
      logger: 'console',
      extra: {
        arguments: ['console log'],
      },
    }),
  );
  expect(logEvent?.exception).toBeUndefined();
  expect(warnEvent).toEqual(
    expect.objectContaining({
      level: 'warning',
      logger: 'console',
      extra: {
        arguments: ['console warn'],
      },
    }),
  );
  expect(warnEvent?.exception).toBeUndefined();
  expect(infoEvent).toEqual(
    expect.objectContaining({
      level: 'info',
      logger: 'console',
      extra: {
        arguments: ['console info'],
      },
    }),
  );
  expect(infoEvent?.exception).toBeUndefined();
  expect(errorEvent).toEqual(
    expect.objectContaining({
      level: 'error',
      logger: 'console',
      extra: {
        arguments: ['console error'],
      },
    }),
  );
  expect(errorEvent?.exception).toBeUndefined();
  expect(traceEvent).toEqual(
    expect.objectContaining({
      level: 'log',
      logger: 'console',
      extra: {
        arguments: ['console trace'],
      },
    }),
  );
  expect(traceEvent?.exception).toBeUndefined();
  expect(errorWithErrorEvent).toEqual(
    expect.objectContaining({
      level: 'error',
      logger: 'console',
      extra: {
        arguments: [
          {
            message: 'console error with error object',
            name: 'Error',
            stack: expect.any(String),
          },
        ],
      },
      exception: expect.any(Object),
    }),
  );
  expect(errorWithErrorEvent?.exception?.values?.[0].value).toBe('console error with error object');
  expect(traceWithErrorEvent).toEqual(
    expect.objectContaining({
      level: 'log',
      logger: 'console',
      extra: {
        arguments: [
          {
            message: 'console trace with error object',
            name: 'Error',
            stack: expect.any(String),
          },
        ],
      },
    }),
  );
  expect(traceWithErrorEvent?.exception?.values?.[0].value).toBe('console trace with error object');
});
