import { expect, test } from '@playwright/test';
import { collectStreamedSpans } from '@sentry-internal/test-utils';
import { getSegmentChildSpans } from './utils';

test('server pageload request span has nested request span for sub request', async ({ page }) => {
  const serverTraceSpansPromise = collectStreamedSpans('sveltekit-2-kit-tracing', spansOfTrace =>
    spansOfTrace.some(span => span.name === 'GET /server-load-fetch' && span.is_segment),
  );

  await page.goto('/server-load-fetch');

  const serverTraceSpans = await serverTraceSpansPromise;
  const serverSpan = serverTraceSpans.find(span => span.name === 'GET /server-load-fetch' && span.is_segment)!;

  expect(serverSpan.status).toBe('ok');
  expect(serverSpan.attributes).toMatchObject({
    'sentry.op': { value: 'http.server', type: 'string' },
    'sentry.origin': { value: 'auto.http.sveltekit', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'http.method': { value: 'GET', type: 'string' },
    'http.request.method': { value: 'GET', type: 'string' },
    'http.route': { value: '/server-load-fetch', type: 'string' },
    'sveltekit.tracing.original_name': { value: 'sveltekit.handle.root', type: 'string' },
    'url.full': { value: 'http://localhost:3030/server-load-fetch', type: 'string' },
    'http.request.header.accept': { value: expect.any(String), type: 'string' },
    'http.request.header.user_agent': { value: expect.any(String), type: 'string' },
  });

  const spans = getSegmentChildSpans(serverTraceSpans, serverSpan);

  expect(spans).toHaveLength(6);

  expect(spans).toEqual(
    expect.arrayContaining([
      // initial resolve span:
      expect.objectContaining({
        name: 'sveltekit.resolve',
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'function', type: 'string' },
          'sentry.origin': { value: 'auto.http.sveltekit', type: 'string' },
          'http.route': { value: '/server-load-fetch', type: 'string' },
        }),
      }),

      // sequenced handler span:
      expect.objectContaining({
        name: 'sveltekit.handle.sequenced.sentryRequestHandler',
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'function', type: 'string' },
          'sentry.origin': { value: 'auto.function.sveltekit.handle', type: 'string' },
        }),
      }),

      // load span where the server load function initiates the sub request:
      expect.objectContaining({
        name: 'sveltekit.load',
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'function', type: 'string' },
          'sentry.origin': { value: 'auto.function.sveltekit.load', type: 'string' },
          'http.route': { value: '/server-load-fetch', type: 'string' },
          'sveltekit.load.environment': { value: 'server', type: 'string' },
          'sveltekit.load.node_id': { value: 'src/routes/server-load-fetch/+page.server.ts', type: 'string' },
          'sveltekit.load.node_type': { value: '+page.server', type: 'string' },
        }),
      }),

      // sub request http.server span:
      expect.objectContaining({
        name: 'GET /api/users',
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'http.server', type: 'string' },
          'sentry.origin': { value: 'auto.http.sveltekit', type: 'string' },
          'http.method': { value: 'GET', type: 'string' },
          'http.route': { value: '/api/users', type: 'string' },
          'url.full': { value: 'http://localhost:3030/api/users', type: 'string' },
          'url.path': { value: '/api/users', type: 'string' },
          'sveltekit.is_data_request': { value: false, type: 'boolean' },
          'sveltekit.is_sub_request': { value: true, type: 'boolean' },
          'sveltekit.tracing.original_name': { value: 'sveltekit.handle.root', type: 'string' },
        }),
      }),

      // sub request sequenced handler span:
      expect.objectContaining({
        name: 'sveltekit.handle.sequenced.sentryRequestHandler',
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'function', type: 'string' },
          'sentry.origin': { value: 'auto.function.sveltekit.handle', type: 'string' },
        }),
      }),

      // sub request resolve span:
      expect.objectContaining({
        name: 'sveltekit.resolve',
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'function', type: 'string' },
          'sentry.origin': { value: 'auto.http.sveltekit', type: 'string' },
          'http.route': { value: '/api/users', type: 'string' },
        }),
      }),
    ]),
  );
});

test('server trace includes form action span', async ({ page }) => {
  const serverTraceSpansPromise = collectStreamedSpans('sveltekit-2-kit-tracing', spansOfTrace =>
    spansOfTrace.some(span => span.name === 'POST /form-action' && span.is_segment),
  );

  await page.goto('/form-action');

  await page.locator('#inputName').fill('H4cktor');
  await page.locator('#buttonSubmit').click();

  const serverTraceSpans = await serverTraceSpansPromise;
  const serverSpan = serverTraceSpans.find(span => span.name === 'POST /form-action' && span.is_segment)!;

  expect(serverSpan.attributes).toMatchObject({
    'sentry.op': { value: 'http.server', type: 'string' },
    'sentry.origin': { value: 'auto.http.sveltekit', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
  });

  const spans = getSegmentChildSpans(serverTraceSpans, serverSpan);

  expect(spans).toHaveLength(3);

  expect(spans).toEqual(
    expect.arrayContaining([
      // sequenced handler span
      expect.objectContaining({
        name: 'sveltekit.handle.sequenced.sentryRequestHandler',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'function', type: 'string' },
          'sentry.origin': { value: 'auto.function.sveltekit.handle', type: 'string' },
        }),
      }),

      // resolve span
      expect.objectContaining({
        name: 'sveltekit.resolve',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'function', type: 'string' },
          'sentry.origin': { value: 'auto.http.sveltekit', type: 'string' },
        }),
      }),

      // form action span
      expect.objectContaining({
        name: 'sveltekit.form_action',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'function', type: 'string' },
          'sentry.origin': { value: 'auto.function.sveltekit.action', type: 'string' },
          'sveltekit.form_action.name': { value: 'default', type: 'string' },
        }),
      }),
    ]),
  );
});
