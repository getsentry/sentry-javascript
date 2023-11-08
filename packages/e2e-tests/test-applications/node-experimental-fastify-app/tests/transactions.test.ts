import { test, expect } from '@playwright/test';
import { waitForTransaction } from '../event-proxy-server';
import axios, { AxiosError } from 'axios';

const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;
const sentryTestProject = process.env.E2E_TEST_SENTRY_TEST_PROJECT;
const EVENT_POLLING_TIMEOUT = 30_000;

test('Sends an API route transaction', async ({ baseURL }) => {
  const pageloadTransactionEventPromise = waitForTransaction('node-experimental-fastify-app', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-transaction'
    );
  });

  await axios.get(`${baseURL}/test-transaction`);

  const transactionEvent = await pageloadTransactionEventPromise;
  const transactionEventId = transactionEvent.event_id;

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      contexts: expect.objectContaining({
        trace: {
          data: {
            url: 'http://localhost:3030/test-transaction',
            'otel.kind': 'SERVER',
            'http.response.status_code': 200,
          },
          op: 'http.server',
          span_id: expect.any(String),
          status: 'ok',
          tags: {
            'http.status_code': 200,
          },
          trace_id: expect.any(String),
          origin: 'auto.http.otel.http',
        },
      }),

      spans: [
        {
          data: {
            'plugin.name': 'fastify -> app-auto-0',
            'fastify.type': 'request_handler',
            'http.route': '/test-transaction',
            'otel.kind': 'INTERNAL',
          },
          description: 'request handler - fastify -> app-auto-0',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          status: 'ok',
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
          origin: 'auto.http.otel.fastify',
        },
        {
          data: {
            'otel.kind': 'INTERNAL',
          },
          description: 'test-span',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          status: 'ok',
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
          origin: 'manual',
        },
        {
          data: {
            'otel.kind': 'INTERNAL',
          },
          description: 'child-span',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          status: 'ok',
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
          origin: 'manual',
        },
      ],
      tags: {
        'http.status_code': 200,
      },
      transaction: 'GET /test-transaction',
      type: 'transaction',
      transaction_info: {
        source: 'route',
      },
    }),
  );

  await expect
    .poll(
      async () => {
        try {
          const response = await axios.get(
            `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/events/${transactionEventId}/`,
            { headers: { Authorization: `Bearer ${authToken}` } },
          );

          return response.status;
        } catch (e) {
          if (e instanceof AxiosError && e.response) {
            if (e.response.status !== 404) {
              throw e;
            } else {
              return e.response.status;
            }
          } else {
            throw e;
          }
        }
      },
      {
        timeout: EVENT_POLLING_TIMEOUT,
      },
    )
    .toBe(200);
});
