import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AwsLambdaExtension } from '../../src/lambda-extension/aws-lambda-extension';
import { SHUTDOWN_BUDGET_MS, SHUTDOWN_IDLE_GRACE_MS, SHUTDOWN_MARGIN_MS } from '../../src/lambda-extension/constants';
import { activeTimers, drainedAfter, recordTunnelActivity, trackUpload, waitForQuietTimers } from './helpers';

describe('AwsLambdaExtension.drainPendingUploads', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('waits out a genuine deadline, less the margin that keeps the drain off the SIGKILL', async () => {
    const extension = new AwsLambdaExtension();
    trackUpload(extension, new Promise(() => {}));
    const startedAt = Date.now();

    const elapsed = await drainedAfter(extension.drainPendingUploads(startedAt + 700), startedAt);

    expect(elapsed).toBe(700 - SHUTDOWN_MARGIN_MS);
  });

  // AWS's own documented example payload carries `deadlineMs: 676051`, which is not an epoch value.
  // Read as one it yields a negative budget and drops whatever is in flight, so anything that is
  // not a plausible remaining window has to fall back to the limit Lambda enforces anyway.
  test.each([
    ['no deadline at all', () => undefined],
    ['a deadline already in the past', () => Date.now() - 5_000],
    ["AWS's own documented 676051", () => 676_051],
    ['a deadline sent as a string', () => String(Date.now() + 1_000)],
    ['an empty object', () => ({})],
  ])('falls back to the shutdown budget for %s', async (_shape, deadline) => {
    const extension = new AwsLambdaExtension();
    trackUpload(extension, new Promise(() => {}));
    const startedAt = Date.now();

    const elapsed = await drainedAfter(extension.drainPendingUploads(deadline()), startedAt);

    expect(elapsed).toBe(SHUTDOWN_BUDGET_MS - SHUTDOWN_MARGIN_MS);
  });

  test('holds the idle grace open once nothing is left to send', async () => {
    // The runtime gets SIGTERM before the extension is released, so envelopes — the SDK's own exit
    // flush among them — keep arriving after the shutdown event. Returning the moment the pending
    // set is empty drops every one of them.
    const extension = new AwsLambdaExtension();
    const startedAt = Date.now();

    const elapsed = await drainedAfter(extension.drainPendingUploads(undefined), startedAt);

    expect(elapsed).toBe(SHUTDOWN_IDLE_GRACE_MS);
  });

  test('re-arms the idle grace on tunnel activity', async () => {
    // A burst of exit flushes should extend the wait rather than race it.
    const extension = new AwsLambdaExtension();
    const startedAt = Date.now();
    setTimeout(() => recordTunnelActivity(extension, Date.now()), 200);

    const elapsed = await drainedAfter(extension.drainPendingUploads(undefined), startedAt);

    expect(elapsed).toBe(200 + SHUTDOWN_IDLE_GRACE_MS);
  });
});

describe('AwsLambdaExtension.drainPendingUploads on the real clock', () => {
  test('leaves no referenced timer behind when an upload beats the deadline', async () => {
    // A timer this drain armed and never cleared holds the process open past the drain, which
    // elapsed time cannot show: it is identical either way. Only referenced timers are counted,
    // because only those hold anything open — the loser timer inside core's own `drain` is
    // unref'd and so invisible here. What this does see is a `sleep` armed and never awaited.
    await waitForQuietTimers();
    expect(activeTimers()).toBe(0);

    const extension = new AwsLambdaExtension();
    trackUpload(extension, delay(20));

    await extension.drainPendingUploads(Date.now() + SHUTDOWN_BUDGET_MS);

    expect(activeTimers()).toBe(0);
  });
});
