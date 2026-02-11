import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../utils/helpers';

sentryTest(
  'captures console messages correctly and adds a synthetic stack trace if `attachStackTrace` is set to `true`',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    const [, events] = await Promise.all([page.goto(url), getMultipleSentryEnvelopeRequests<Event>(page, 7)]);

    expect(events).toHaveLength(7);

    const logEvent = events.find(event => event.message === 'console log');
    const warnEvent = events.find(event => event.message === 'console warn');
    const infoEvent = events.find(event => event.message === 'console info');
    const errorEvent = events.find(event => event.message === 'console error');
    const traceEvent = events.find(event => event.message === 'console trace');
    const errorWithErrorEvent = events.find(
      event => event.exception?.values?.[0].value === 'console error with error object',
    );
    const traceWithErrorEvent = events.find(
      event => event.exception?.values?.[0].value === 'console trace with error object',
    );

    expect(logEvent).toEqual(
      expect.objectContaining({
        level: 'log',
        logger: 'console',
        extra: {
          arguments: ['console log'],
        },
        message: 'console log',
      }),
    );
    expect(logEvent?.exception?.values![0]).toMatchObject({
      mechanism: {
        handled: true,
        type: 'auto.core.capture_console',
        synthetic: true,
      },
      value: 'console log',
      stacktrace: {
        frames: expect.any(Array),
      },
    });

    expect(warnEvent).toEqual(
      expect.objectContaining({
        level: 'warning',
        logger: 'console',
        extra: {
          arguments: ['console warn'],
        },
        message: 'console warn',
      }),
    );
    expect(warnEvent?.exception?.values![0]).toMatchObject({
      mechanism: {
        handled: true,
        type: 'auto.core.capture_console',
        synthetic: true,
      },
      value: 'console warn',
      stacktrace: {
        frames: expect.any(Array),
      },
    });

    expect(infoEvent).toEqual(
      expect.objectContaining({
        level: 'info',
        logger: 'console',
        extra: {
          arguments: ['console info'],
        },
        message: 'console info',
      }),
    );
    expect(infoEvent?.exception?.values![0]).toMatchObject({
      mechanism: {
        handled: true,
        type: 'auto.core.capture_console',
        synthetic: true,
      },
      value: 'console info',
      stacktrace: {
        frames: expect.any(Array),
      },
    });

    expect(errorEvent).toEqual(
      expect.objectContaining({
        level: 'error',
        logger: 'console',
        extra: {
          arguments: ['console error'],
        },
        message: 'console error',
      }),
    );
    expect(errorEvent?.exception?.values![0]).toMatchObject({
      mechanism: {
        handled: true,
        type: 'auto.core.capture_console',
        synthetic: true,
      },
      value: 'console error',
      stacktrace: {
        frames: expect.any(Array),
      },
    });

    expect(traceEvent).toEqual(
      expect.objectContaining({
        level: 'log',
        logger: 'console',
        extra: {
          arguments: ['console trace'],
        },
        message: 'console trace',
      }),
    );
    expect(traceEvent?.exception?.values![0]).toMatchObject({
      mechanism: {
        handled: true,
        type: 'auto.core.capture_console',
        synthetic: true,
      },
      value: 'console trace',
      stacktrace: {
        frames: expect.any(Array),
      },
    });

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
    expect(errorWithErrorEvent?.exception?.values?.[0].mechanism).toEqual({
      handled: true,
      type: 'auto.core.capture_console',
    });
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
  },
);
