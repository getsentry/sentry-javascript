import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Workflow emits error event on every retry attempt (legacy behavior without step context)', async ({
  baseURL,
}) => {
  const errors: unknown[] = [];
  const seenEventIds = new Set<string>();

  // Waiter that collects 3 unique error events before resolving
  const errorCollector = waitForError('cloudflare-workers-workflow-legacy', event => {
    if (
      event.exception?.values?.[0]?.value === 'Intentional failure for retry test' &&
      event.exception?.values?.[0]?.mechanism?.type === 'auto.faas.cloudflare.workflow'
    ) {
      const eventId = event.event_id;
      if (eventId && !seenEventIds.has(eventId)) {
        seenEventIds.add(eventId);
        errors.push(event);
      }
      // Return true only when we have all 3 errors
      return errors.length >= 3;
    }
    return false;
  });

  // Trigger workflow with 3 failures (exceeds retry limit of 2)
  const response = await fetch(`${baseURL}/trigger-workflow?failCount=3`);
  expect(response.status).toBe(200);

  // Wait for all 3 errors to be collected
  await errorCollector;

  // Legacy behavior: errors captured on all 3 attempts (unique events)
  expect(errors.length).toBe(3);
});
