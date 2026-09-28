import childProcess from 'child_process';
import path from 'path';
import { test } from 'vitest';

const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;
const EVENT_POLLING_TIMEOUT = 90_000;

/**
 * The event serializer emits source context as `[lineNo, line]` pairs spanning the frame's line
 * and its surroundings, rather than the separate pre/context/post fields of the raw event.
 */
interface SerializedFrame {
  lineNo: number | null;
  colNo: number | null;
  context: [number, string][] | null;
}

function splitFrameContext(frame: SerializedFrame): Record<string, unknown> {
  const context = frame.context ?? [];

  return {
    preContext: context.filter(([lineNo]) => lineNo < (frame.lineNo ?? 0)).map(([, line]) => line),
    contextLine: context.find(([lineNo]) => lineNo === frame.lineNo)?.[1],
    postContext: context.filter(([lineNo]) => lineNo > (frame.lineNo ?? 0)).map(([, line]) => line),
    lineno: frame.lineNo,
    colno: frame.colNo,
  };
}

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
      const response = await fetch(`https://sentry.io/api/0/organizations/${sentryTestOrgSlug}/eventids/${eventId}/`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      // This is org scoped, so the auth token needs `org:read` on top of the project scopes.
      // That never resolves by waiting, so fail loudly rather than timing out.
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `Event lookup was rejected with ${response.status}: ${await response.text()}. ` +
            'E2E_TEST_AUTH_TOKEN needs the `org:read` scope.',
        );
      }

      // Only allow ok responses or 404
      if (!response.ok) {
        expect(response.status).toBe(404);
        continue;
      }

      const { event } = await response.json();
      const exception = event.entries.find((entry: { type: string }) => entry.type === 'exception');
      const frames: SerializedFrame[] = exception.data.values[0].stacktrace.frames;
      const topFrame = frames[frames.length - 1];

      if (topFrame === undefined) {
        throw new Error('Symbolicated event has no stack frames.');
      }

      expect(splitFrameContext(topFrame)).toMatchSnapshot();
      return;
    }

    throw new Error('Test timed out');
  },
  { timeout: EVENT_POLLING_TIMEOUT },
);
