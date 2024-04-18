import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/event-proxy-server';
import axios, { AxiosError } from 'axios';

const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;
const sentryTestProject = process.env.E2E_TEST_SENTRY_TEST_PROJECT;
const EVENT_POLLING_TIMEOUT = 90_000;

test('Sends captured exception to Sentry', async ({ baseURL }) => {
  const { data } = await axios.get(`${baseURL}/test-error`);
  const { exceptionId } = data;

  const url = `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/events/${exceptionId}/`;

  console.log(`Polling for error eventId: ${exceptionId}`);

  await expect
    .poll(
      async () => {
        try {
          const response = await axios.get(url, { headers: { Authorization: `Bearer ${authToken}` } });

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
      { timeout: EVENT_POLLING_TIMEOUT },
    )
    .toBe(200);
});

test('Sends thrown error to Sentry', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-hapi-app', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'This is an error';
  });

  try {
    await axios.get(`${baseURL}/test-failure`);
  } catch (e) {}

  const errorEvent = await errorEventPromise;
  const errorEventId = errorEvent.event_id;

  await expect
    .poll(
      async () => {
        try {
          const response = await axios.get(
            `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/events/${errorEventId}/`,
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

test('Sends successful transactions to Sentry', async ({ baseURL }) => {
  const pageloadTransactionEventPromise = waitForTransaction('node-hapi-app', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'hapi.request' && transactionEvent?.transaction === '/test-success'
    );
  });

  await axios.get(`${baseURL}/test-success`);

  const transactionEvent = await pageloadTransactionEventPromise;
  const transactionEventId = transactionEvent.event_id;

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

test('sends error with parameterized transaction name', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-hapi-app', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'This is an error with id 123';
  });

  try {
    await axios.get(`${baseURL}/test-error/123`);
  } catch {}

  const errorEvent = await errorEventPromise;

  expect(errorEvent?.transaction).toBe('GET /test-error/{id}');
});

test('Sends parameterized transactions to Sentry', async ({ baseURL }) => {
  const pageloadTransactionEventPromise = waitForTransaction('node-hapi-app', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'hapi.request' &&
      transactionEvent?.transaction === '/test-param/{param}'
    );
  });

  await axios.get(`${baseURL}/test-param/123`);

  const transactionEvent = await pageloadTransactionEventPromise;
  const transactionEventId = transactionEvent.event_id;

  expect(transactionEvent?.contexts?.trace?.op).toBe('hapi.request');
  expect(transactionEvent?.transaction).toBe('/test-param/{param}');

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

test('Sends sentry-trace and baggage as response headers', async ({ baseURL }) => {
  const data = await axios.get(`${baseURL}/test-success`);

  expect(data.headers).toHaveProperty('sentry-trace');
  expect(data.headers).toHaveProperty('baggage');
});

test('Continues trace and baggage from incoming headers', async ({ baseURL }) => {
  const traceContent = '12312012123120121231201212312012-1121201211212012-0';
  const baggageContent = 'sentry-release=2.0.0,sentry-environment=myEnv';

  await axios.get(`${baseURL}/test-success`);

  const data = await axios.get(`${baseURL}/test-success`, {
    headers: {
      'sentry-trace': traceContent,
      baggage: baggageContent,
    },
  });

  expect(data.headers).toHaveProperty('sentry-trace');
  expect(data.headers).toHaveProperty('baggage');

  expect(data.headers['sentry-trace']).toContain('12312012123120121231201212312012-');
  expect(data.headers['baggage']).toContain(baggageContent);
});
