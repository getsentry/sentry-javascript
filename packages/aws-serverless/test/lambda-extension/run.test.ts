import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AwsLambdaExtension } from '../../src/lambda-extension/aws-lambda-extension';
import {
  MAX_REPORTED_FAILURES,
  TERMINAL_POLL_CONFIRMATIONS,
  TERMINAL_POLL_STATUSES,
  POLL_ESTABLISHED_MS,
  POLL_GIVE_UP_MS,
  POLL_RETRY_BASE_MS,
} from '../../src/lambda-extension/constants';
import { ExtensionsApiError } from '../../src/lambda-extension/errors';
import { runToOutcome, type ScriptedPoll, scriptPolls, spyOnExit } from './helpers';

/** Exactly as many refusals as it takes to confirm one, so the count follows the constant. */
function refusalsOf(status: number): ExtensionsApiError[] {
  return Array.from(
    { length: TERMINAL_POLL_CONFIRMATIONS },
    (_, i) => new ExtensionsApiError(`refused #${i + 1}`, status),
  );
}

describe('AwsLambdaExtension.run', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof spyOnExit>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = spyOnExit();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('keeps polling after a failed poll', async () => {
    // Lambda holds an invocation open until every registered extension asks for the next event, so
    // a loop that stops on the first rejection leaves later invocations to the function timeout.
    const extension = new AwsLambdaExtension();
    const { next } = scriptPolls(extension, [
      new Error('socket hang up'),
      { eventType: 'INVOKE' },
      { eventType: 'SHUTDOWN' },
    ]);

    await runToOutcome(extension);

    expect(next).toHaveBeenCalledTimes(3);
  });

  test('reports a failed poll on the console, which the debug logger cannot do here', async () => {
    const extension = new AwsLambdaExtension();
    const pollFailure = new Error('socket hang up');
    scriptPolls(extension, [pollFailure, { eventType: 'SHUTDOWN' }]);

    await runToOutcome(extension);

    expect(errorSpy).toHaveBeenCalledWith(
      'Sentry Lambda extension: polling the Extensions API failed, retrying.',
      pollFailure,
    );
  });

  test('returns a shutdown outcome instead of throwing or ending the process', async () => {
    // Polling after SHUTDOWN only produces failures on the way out, and the caller needs to tell
    // that ending apart from a loop that gave up: only this one may exit the process.
    const extension = new AwsLambdaExtension();
    const { next } = scriptPolls(extension, [{ eventType: 'SHUTDOWN' }]);

    const outcome = await runToOutcome(extension);

    expect(outcome).toEqual({ reason: 'shutdown', pollAccepted: true });
    expect(next).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  test.each(TERMINAL_POLL_STATUSES)('stops polling once a %i has been confirmed, without exiting', async status => {
    // Nothing exits on a poll failure: with only SHUTDOWN subscribed, an extension that stopped
    // polling costs the customer nothing, while a process ending outside the shutdown phase is
    // reported as `Extension.Crash` against the invocation in flight.
    const extension = new AwsLambdaExtension();
    const refusals = refusalsOf(status);
    const { next } = scriptPolls(extension, refusals);

    const outcome = await runToOutcome(extension);

    expect(outcome).toEqual({ reason: 'unrecoverable', pollAccepted: false, error: refusals.at(-1) });
    expect(next).toHaveBeenCalledTimes(TERMINAL_POLL_CONFIRMATIONS);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  test.each(TERMINAL_POLL_STATUSES)(
    'keeps polling after a single %i, which is how a teardown poll is answered',
    async status => {
      // A 500 is also how the API answers a poll issued while the environment is already being torn
      // down, which clears on its own; confirming costs a few hundred ms of backoff.
      const extension = new AwsLambdaExtension();
      const { next } = scriptPolls(extension, [
        new ExtensionsApiError('refused once', status),
        { eventType: 'INVOKE' },
        { eventType: 'SHUTDOWN' },
      ]);

      const outcome = await runToOutcome(extension);

      expect(outcome).toEqual({ reason: 'shutdown', pollAccepted: true });
      expect(next).toHaveBeenCalledTimes(3);
    },
  );

  test('retries a 408 and a 429 however often they repeat', async () => {
    // These are the two 4xx that do start working again; counting them towards the terminal
    // confirmations would stop the loop over a hiccup that repeats a few times.
    const extension = new AwsLambdaExtension();
    const { next } = scriptPolls(extension, [
      new ExtensionsApiError('request timeout', 408),
      new ExtensionsApiError('too many requests', 429),
      new ExtensionsApiError('request timeout', 408),
      { eventType: 'SHUTDOWN' },
    ]);

    const outcome = await runToOutcome(extension);

    expect(outcome).toEqual({ reason: 'shutdown', pollAccepted: true });
    expect(next).toHaveBeenCalledTimes(4);
  });

  test('confirms a refusal that flaps with transport failures', async () => {
    // A permanent refusal rarely arrives cleanly: the API refuses, the socket drops, the API
    // refuses again. A count the transport failure resets never confirms, and the loop retries a
    // refusal that is never going to clear for the environment's whole life.
    const extension = new AwsLambdaExtension();
    const refusals = refusalsOf(403);
    const flapping = refusals.flatMap((refusal, i) =>
      i === refusals.length - 1 ? [refusal] : [refusal, new Error('ECONNRESET')],
    );
    const { next } = scriptPolls(extension, flapping);

    const outcome = await runToOutcome(extension);

    expect(outcome).toEqual({ reason: 'unrecoverable', pollAccepted: false, error: refusals.at(-1) });
    expect(next).toHaveBeenCalledTimes(flapping.length);
  });

  test('starts counting over after a poll the API held open', async () => {
    // Subscribed to SHUTDOWN alone the extension issues one poll per execution environment, so
    // "since the last event" spans the environment's whole life. A poll the API accepted and
    // parked is the only health signal left, and it has to clear both counters.
    const extension = new AwsLambdaExtension();
    const { next, startedAt } = scriptPolls(extension, [
      new ExtensionsApiError('refused #1', 403),
      new ExtensionsApiError('refused #2', 403),
      { heldForMs: POLL_ESTABLISHED_MS, then: new ExtensionsApiError('refused #3', 403) },
      new ExtensionsApiError('refused #4', 403),
      { eventType: 'SHUTDOWN' },
    ]);

    const outcome = await runToOutcome(extension);

    expect(outcome).toEqual({ reason: 'shutdown', pollAccepted: true });
    expect(next).toHaveBeenCalledTimes(5);
    // The backoff starts over too, rather than staying where a long-failing loop had reached.
    expect(startedAt[3]! - (startedAt[2]! + POLL_ESTABLISHED_MS)).toBe(POLL_RETRY_BASE_MS);
  });

  test('measures the give-up window from the failure, not from when the parked poll was issued', async () => {
    // One poll is parked for the environment's whole life, and warm environments outlive the
    // give-up window many times over — so a clock started at `sentAt` would spend the entire budget
    // before the first retry, and the first hiccup after a long park would end the loop outright.
    const extension = new AwsLambdaExtension();
    const { next } = scriptPolls(extension, [
      { heldForMs: POLL_GIVE_UP_MS + 60_000, then: new Error('ECONNRESET') },
      { eventType: 'SHUTDOWN' },
    ]);

    const outcome = await runToOutcome(extension, POLL_GIVE_UP_MS + 120_000);

    expect(outcome).toEqual({ reason: 'shutdown', pollAccepted: true });
    expect(next).toHaveBeenCalledTimes(2);
  });

  test('keeps the give-up window it restarted, rather than expiring on the failures before it', async () => {
    // The restart is the point of the established-poll branch: a poll the API accepted and parked
    // is a health signal, so the budget starts over. Clearing the counters without clearing the
    // clock would expire the loop shortly after the very signal that was supposed to reprieve it.
    const extension = new AwsLambdaExtension();
    const failure = new Error('ECONNREFUSED');
    // Capped backoff makes this about 14 minutes of failing before the API answers once.
    const { next } = scriptPolls(extension, [
      ...Array<Error>(170).fill(failure),
      { heldForMs: POLL_ESTABLISHED_MS, then: failure },
      ...Array<Error>(400).fill(failure),
    ]);

    // Past the give-up measured from the first failure, well short of it measured from the poll
    // the API answered — so a loop still running here is one whose clock restarted.
    const outcome = await runToOutcome(extension, POLL_GIVE_UP_MS + 30_000);

    expect(outcome).toBe('still polling');
    expect(next.mock.calls.length).toBeGreaterThan(170);
  });

  test('caps the console over the environment lifetime, not over the latest streak of failures', async () => {
    // A peer that accepts the poll and then dies restarts the retry budget every time, which is
    // right — the API is still answering. A cap tied to that counter would reset with it and write
    // a line every few seconds for as long as the environment lives.
    const extension = new AwsLambdaExtension();
    const { next } = scriptPolls(
      extension,
      Array.from({ length: 200 }, () => ({ heldForMs: POLL_ESTABLISHED_MS, then: new Error('ECONNRESET') })),
    );

    await runToOutcome(extension, 60 * 60_000);

    expect(next.mock.calls.length).toBeGreaterThan(MAX_REPORTED_FAILURES);
    expect(errorSpy).toHaveBeenCalledTimes(MAX_REPORTED_FAILURES);
  });

  test('backs off after an event it never subscribed to, rather than re-polling with no delay', async () => {
    // Subscribed to SHUTDOWN alone, anything else is the API answering outside its own contract.
    // Falling through would re-poll immediately, and nothing rate-limits this loop once the
    // extension is out of the invocation gate.
    const extension = new AwsLambdaExtension();
    const { next, startedAt } = scriptPolls(extension, [{ eventType: 'INVOKE' }, { eventType: 'SHUTDOWN' }]);

    const outcome = await runToOutcome(extension);

    expect(outcome).toEqual({ reason: 'shutdown', pollAccepted: true });
    expect(next).toHaveBeenCalledTimes(2);
    expect(startedAt[1]! - startedAt[0]!).toBe(POLL_RETRY_BASE_MS);
  });

  test('gives up on the wall clock rather than after a fixed number of polls', async () => {
    // The give-up sits above the 900s function ceiling, so an outage spanning one whole invocation
    // cannot trip it — and a 20-poll cap would, since capped backoff reaches 20 polls in ~80s.
    const extension = new AwsLambdaExtension();
    const failure = new Error('ECONNREFUSED');
    let polls = 0;
    vi.spyOn(extension, 'next').mockImplementation(async () => {
      polls++;
      throw failure;
    });
    const startedAt = Date.now();

    const outcome = await runToOutcome(extension, POLL_GIVE_UP_MS + 60_000);

    expect(outcome).toEqual({ reason: 'unrecoverable', pollAccepted: false, error: failure });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(POLL_GIVE_UP_MS);
    expect(polls).toBeGreaterThan(MAX_REPORTED_FAILURES);
    // The loop outlives the console reporting, which is capped so it does not bill the customer
    // for one line every 5s until the environment is recycled.
    expect(errorSpy).toHaveBeenCalledTimes(MAX_REPORTED_FAILURES);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  test.each([
    ['never answered a poll', [], false],
    ['answered one, whatever it answered with', [{ eventType: 'INVOKE' }], true],
    // Deliberately false: elapsed time cannot tell a poll the API parked from a connect that hung,
    // and the two failures are not symmetric — exiting when we should have parked costs one
    // invocation, while parking when we should have exited bills every one of them to the function
    // timeout for the life of the environment.
    ['only held one open before it failed', [{ heldForMs: POLL_ESTABLISHED_MS, then: new Error('ECONNRESET') }], false],
  ])('reports that the Extensions API %s', async (_label, prelude, pollAccepted) => {
    // Lambda releases the init phase on the first poll the API answers, and `main` needs to tell
    // the two apart: giving up before that holds every invocation, giving up after it is free.
    const extension = new AwsLambdaExtension();
    const refusals = refusalsOf(403);
    scriptPolls(extension, [...(prelude as ScriptedPoll[]), ...refusals]);

    const outcome = await runToOutcome(extension);

    expect(outcome).toEqual({ reason: 'unrecoverable', pollAccepted, error: refusals.at(-1) });
  });
});
