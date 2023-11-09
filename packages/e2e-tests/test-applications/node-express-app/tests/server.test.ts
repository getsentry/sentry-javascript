import { test, expect } from '@playwright/test';
import axios, { AxiosError, AxiosResponse } from 'axios';
import { waitForError } from '../event-proxy-server';

const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;
const sentryTestProject = process.env.E2E_TEST_SENTRY_TEST_PROJECT;
const EVENT_POLLING_TIMEOUT = 90_000;

test('Sends exception to Sentry', async ({ baseURL }) => {
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

test('Sends transactions to Sentry', async ({ baseURL }) => {
  const { data } = await axios.get(`${baseURL}/test-transaction`);
  const { transactionIds } = data;

  console.log(`Polling for transaction eventIds: ${JSON.stringify(transactionIds)}`);

  expect(transactionIds.length).toBeGreaterThan(0);

  await Promise.all(
    transactionIds.map(async (transactionId: string) => {
      const url = `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/events/${transactionId}/`;

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
    }),
  );
});

test('Should record caught exceptions with local variable', async ({ baseURL }) => {
  const { data } = await axios.get(`${baseURL}/test-local-variables-caught`);
  const { exceptionId } = data;

  const url = `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/events/${exceptionId}/json/`;

  console.log(`Polling for error eventId: ${exceptionId}`);

  let response: AxiosResponse;

  await expect
    .poll(
      async () => {
        try {
          response = await axios.get(url, { headers: { Authorization: `Bearer ${authToken}` } });

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

  const frames = response!.data.exception.values[0].stacktrace.frames;

  expect(frames[frames.length - 1].vars?.randomVariableToRecord).toBeDefined();
});

test('Should record uncaught exceptions with local variable', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-express-app', errorEvent => {
    return !!errorEvent?.exception?.values?.[0]?.value?.includes('Uncaught Local Variable Error');
  });

  await axios.get(`${baseURL}/test-local-variables-uncaught`).catch(() => {
    // noop
  });

  const routehandlerError = await errorEventPromise;

  const frames = routehandlerError!.exception!.values![0]!.stacktrace!.frames!;

  expect(frames[frames.length - 1].vars?.randomVariableToRecord).toBeDefined();
});
