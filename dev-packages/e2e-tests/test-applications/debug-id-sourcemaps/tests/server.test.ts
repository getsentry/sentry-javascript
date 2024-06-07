import childProcess from 'child_process';
import path from 'path';
import { test } from 'vitest';

const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;
const sentryTestProject = process.env.E2E_TEST_SENTRY_PROJECT;
const EVENT_POLLING_TIMEOUT = 90_000;

test(
  'Find symbolicated event on sentry',
  async ({ expect }) => {
    const eventId = childProcess.execSync(`node ${path.join(__dirname, '..', 'dist', 'app.js')}`, {
      encoding: 'utf-8',
    });

    console.log(`Polling for error eventId: ${eventId}`);

    let timedOut = false;
    setTimeout(() => {
      timedOut = true;
    }, EVENT_POLLING_TIMEOUT);

    while (!timedOut) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // poll every two seconds
      const response = await fetch(
        `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/events/${eventId}/json/`,
        { headers: { Authorization: `Bearer ${authToken}` } },
      );

      // Only allow ok responses or 404
      if (!response.ok) {
        expect(response.status).toBe(404);
        continue;
      }

      const eventPayload = await response.json();
      const frames = eventPayload.exception?.values?.[0]?.stacktrace?.frames;
      const topFrame = frames[frames.length - 1];
      expect({
        preContext: topFrame?.pre_context,
        contextLine: topFrame?.context_line,
        postContext: topFrame?.post_context,
        lineno: topFrame?.lineno,
        colno: topFrame?.colno,
      }).toMatchSnapshot();
      return;
    }

    throw new Error('Test timed out');
  },
  { timeout: EVENT_POLLING_TIMEOUT },
);
