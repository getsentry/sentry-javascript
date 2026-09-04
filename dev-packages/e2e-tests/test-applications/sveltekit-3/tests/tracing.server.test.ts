import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';
import { getSegmentChildSpans } from './utils';

test('server pageload request span has nested request span for sub request', async ({ page }) => {
  const serverTraceSpansPromise = collectStreamedSpansUntilSegment('sveltekit-3', 'GET /server-load-fetch');

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
    'url.full': { value: 'https://localhost:3030/server-load-fetch', type: 'string' },
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
          'url.full': { value: 'https://localhost:3030/api/users', type: 'string' },
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

// FIXME(sveltekit-3): the `POST /form-action` server span never arrives under Kit 3 (no POST
// root span is created server-side; `handleUnknownRoutes` does not help). The `use:enhance` POST
// either doesn't reach the traced handle or isn't traced under Kit 3 — needs isolation. Unskip once
// form-action requests produce a server segment span again.
test.skip('server trace includes form action span', async ({ page }) => {
  const serverTraceSpansPromise = collectStreamedSpansUntilSegment('sveltekit-3', 'POST /form-action');

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

test('server trace for a `QUERY` server route includes the wrapped route handler span', async ({ request }) => {
  const serverTraceSpansPromise = collectStreamedSpansUntilSegment('sveltekit-3', 'QUERY /query-server-route');

  const response = await request.fetch('/query-server-route', {
    method: 'QUERY',
    headers: { 'content-type': 'application/json' },
    data: { term: 'sentry' },
  });

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ term: 'sentry', results: ['alice', 'bob'] });

  const serverTraceSpans = await serverTraceSpansPromise;
  const serverSpan = serverTraceSpans.find(span => span.name === 'QUERY /query-server-route' && span.is_segment)!;

  expect(serverSpan.attributes).toMatchObject({
    'sentry.op': { value: 'http.server', type: 'string' },
    'sentry.origin': { value: 'auto.http.sveltekit', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'http.method': { value: 'QUERY', type: 'string' },
    'http.route': { value: '/query-server-route', type: 'string' },
  });

  expect(getSegmentChildSpans(serverTraceSpans, serverSpan)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'QUERY /query-server-route',
        attributes: expect.objectContaining({
          'sentry.origin': { value: 'auto.function.sveltekit', type: 'string' },
          'code.function.name': { value: 'QUERY', type: 'string' },
          'http.request.method': { value: 'QUERY', type: 'string' },
        }),
      }),
    ]),
  );
});
