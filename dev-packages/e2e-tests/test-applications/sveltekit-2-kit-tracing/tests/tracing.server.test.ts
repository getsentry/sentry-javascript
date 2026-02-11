import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/sveltekit';

test('server pageload request span has nested request span for sub request', async ({ page }) => {
  const serverTxnEventPromise = waitForTransaction('sveltekit-2-kit-tracing', txnEvent => {
    return txnEvent?.transaction === 'GET /server-load-fetch';
  });

  await page.goto('/server-load-fetch');

  const serverTxnEvent = await serverTxnEventPromise;
  const spans = serverTxnEvent.spans;

  expect(serverTxnEvent).toMatchObject({
    transaction: 'GET /server-load-fetch',
    transaction_info: { source: 'route' },
    type: 'transaction',
    contexts: {
      trace: {
        op: 'http.server',
        origin: 'auto.http.sveltekit',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.sveltekit',
          'http.method': 'GET',
          'http.route': '/server-load-fetch',
          'sveltekit.tracing.original_name': 'sveltekit.handle.root',
        },
      },
    },
  });

  expect(spans).toHaveLength(6);

  expect(spans).toEqual(
    expect.arrayContaining([
      // initial resolve span:
      expect.objectContaining({
        data: expect.objectContaining({
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.sveltekit.resolve',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.sveltekit',
          'http.route': '/server-load-fetch',
        }),
        op: 'function.sveltekit.resolve',
        description: 'sveltekit.resolve',
        origin: 'auto.http.sveltekit',
        status: 'ok',
      }),

      // sequenced handler span:
      expect.objectContaining({
        data: expect.objectContaining({
          'sentry.origin': 'auto.function.sveltekit.handle',
          'sentry.op': 'function.sveltekit.handle',
        }),
        description: 'sveltekit.handle.sequenced.sentryRequestHandler',
        op: 'function.sveltekit.handle',
        origin: 'auto.function.sveltekit.handle',
        status: 'ok',
      }),

      // load span where the server load function initiates the sub request:
      expect.objectContaining({
        data: expect.objectContaining({
          'http.route': '/server-load-fetch',
          'sentry.op': 'function.sveltekit.load',
          'sentry.origin': 'auto.function.sveltekit.load',
          'sveltekit.load.environment': 'server',
          'sveltekit.load.node_id': 'src/routes/server-load-fetch/+page.server.ts',
          'sveltekit.load.node_type': '+page.server',
        }),
        description: 'sveltekit.load',
        op: 'function.sveltekit.load',
        origin: 'auto.function.sveltekit.load',
        status: 'ok',
      }),

      // sub request http.server span:
      expect.objectContaining({
        data: expect.objectContaining({
          'http.method': 'GET',
          'http.route': '/api/users',
          'http.url': 'http://localhost:3030/api/users',
          'sentry.op': 'http.server',
          'sentry.origin': 'auto.http.sveltekit',
          'sentry.source': 'route',
          'sveltekit.is_data_request': false,
          'sveltekit.is_sub_request': true,
          'sveltekit.tracing.original_name': 'sveltekit.handle.root',
          url: 'http://localhost:3030/api/users',
        }),
        description: 'GET /api/users',
        op: 'http.server',
        origin: 'auto.http.sveltekit',
        status: 'ok',
      }),

      // sub requestsequenced handler span:
      expect.objectContaining({
        data: expect.objectContaining({
          'sentry.origin': 'auto.function.sveltekit.handle',
          'sentry.op': 'function.sveltekit.handle',
        }),
        description: 'sveltekit.handle.sequenced.sentryRequestHandler',
        op: 'function.sveltekit.handle',
        origin: 'auto.function.sveltekit.handle',
        status: 'ok',
      }),

      // sub request resolve span:
      expect.objectContaining({
        data: expect.objectContaining({
          'http.route': '/api/users',
          'sentry.op': 'function.sveltekit.resolve',
          'sentry.origin': 'auto.http.sveltekit',
        }),
        description: 'sveltekit.resolve',
        op: 'function.sveltekit.resolve',
        origin: 'auto.http.sveltekit',
        status: 'ok',
      }),
    ]),
  );

  expect(serverTxnEvent.request).toEqual({
    cookies: {},
    headers: expect.objectContaining({
      accept: expect.any(String),
      'user-agent': expect.any(String),
    }),
    method: 'GET',
    url: 'http://localhost:3030/server-load-fetch',
  });
});

test('server trace includes form action span', async ({ page }) => {
  const serverTxnEventPromise = waitForTransaction('sveltekit-2-kit-tracing', txnEvent => {
    return txnEvent?.transaction === 'POST /form-action';
  });

  await page.goto('/form-action');

  await page.locator('#inputName').fill('H4cktor');
  await page.locator('#buttonSubmit').click();

  const serverTxnEvent = await serverTxnEventPromise;

  expect(serverTxnEvent).toMatchObject({
    transaction: 'POST /form-action',
    transaction_info: { source: 'route' },
    type: 'transaction',
    contexts: {
      trace: {
        op: 'http.server',
        origin: 'auto.http.sveltekit',
      },
    },
  });

  expect(serverTxnEvent.spans).toHaveLength(3);

  expect(serverTxnEvent.spans).toEqual(
    expect.arrayContaining([
      // sequenced handler span
      expect.objectContaining({
        description: 'sveltekit.handle.sequenced.sentryRequestHandler',
        op: 'function.sveltekit.handle',
        origin: 'auto.function.sveltekit.handle',
      }),

      // resolve span
      expect.objectContaining({
        description: 'sveltekit.resolve',
        op: 'function.sveltekit.resolve',
        origin: 'auto.http.sveltekit',
      }),

      // form action span
      expect.objectContaining({
        description: 'sveltekit.form_action',
        op: 'function.sveltekit.form_action',
        origin: 'auto.function.sveltekit.action',
        data: expect.objectContaining({
          'sveltekit.form_action.name': 'default',
        }),
      }),
    ]),
  );
});
