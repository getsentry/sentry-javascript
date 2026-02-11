import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../utils/helpers';

sentryTest('allows to setup a client manually & capture exceptions', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData).toEqual({
    exception: {
      values: [
        expect.objectContaining({
          type: 'Error',
          value: 'test client',
          mechanism: {
            type: 'generic',
            handled: true,
          },
          stacktrace: {
            frames: expect.any(Array),
          },
        }),
      ],
    },
    level: 'error',
    event_id: expect.any(String),
    platform: 'javascript',
    request: {
      url,
      headers: expect.objectContaining({
        'User-Agent': expect.any(String),
      }),
    },
    timestamp: expect.any(Number),
    environment: 'local',
    release: '0.0.1',
    sdk: {
      integrations: ['Breadcrumbs', 'FunctionToString', 'Dedupe', 'HttpContext', 'EventFilters', 'LinkedErrors'],
      name: 'sentry.javascript.browser',
      version: expect.any(String),
      packages: [{ name: expect.any(String), version: expect.any(String) }],
      settings: {
        infer_ip: 'never',
      },
    },
    contexts: {
      trace: { trace_id: expect.stringMatching(/[a-f\d]{32}/), span_id: expect.stringMatching(/[a-f\d]{16}/) },
    },
  });
});
