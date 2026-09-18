import type * as http from 'node:http';
import {
  EXTENSION_NAME,
  EXTENSIONS_API_PATH,
  MAX_REPORTED_FAILURES,
  POLL_ESTABLISHED_MS,
  POLL_GIVE_UP_MS,
  SHUTDOWN_BUDGET_MS,
  SHUTDOWN_IDLE_GRACE_MS,
  SHUTDOWN_MARGIN_MS,
  TERMINAL_POLL_CONFIRMATIONS,
  TUNNEL_PORT,
} from './constants';
import { ExtensionsApiError, isTerminalPollStatus, PermanentRegistrationError } from './errors';
import { parseEvent, request } from './extensions-api';
import { SentryTunnel } from './sentry-tunnel';
import type { ExtensionEvent, PollOutcome } from './types';
import { logError, retryDelayMs, sleep, truncateBody } from './utils';

/**
 * AWS's own documented example carries `deadlineMs: 676051`, which is not an epoch value — read as
 * one it yields a negative budget and drops whatever is in flight. Anything that is not a plausible
 * remaining window falls back to the limit Lambda enforces anyway.
 */
function shutdownBudgetMs(deadlineMs: unknown): number {
  const remaining = typeof deadlineMs === 'number' ? deadlineMs - Date.now() : NaN;
  const trusted = remaining > 0 && remaining <= SHUTDOWN_BUDGET_MS ? remaining : SHUTDOWN_BUDGET_MS;

  return Math.max(trusted - SHUTDOWN_MARGIN_MS, 0);
}

/**
 * The Extension API Client.
 */
export class AwsLambdaExtension {
  private readonly _baseUrl: string;
  private readonly _tunnel: SentryTunnel;
  private _extensionId: string | null;

  public constructor() {
    this._baseUrl = `http://${process.env.AWS_LAMBDA_RUNTIME_API}${EXTENSIONS_API_PATH}`;
    this._tunnel = new SentryTunnel();
    this._extensionId = null;
  }

  /**
   * Registers as an external extension, subscribed to SHUTDOWN alone.
   *
   * An INVOKE subscription joins the gate that holds every invocation until each subscriber has
   * asked for the next event, so a poll that dies mid-flight would hold the rest of the
   * environment's invocations open until the function timeout. Lambda Managed Instances refuses the
   * subscription outright, taking the function's init down with it.
   *
   * What is retried is the API not answering. Lambda gates the init phase on every registered
   * extension, so never registering holds each invocation open with the handler never running, and
   * a late registration costs only the first invocation.
   */
  public async register(): Promise<void> {
    let failingSince = 0;

    for (let attempt = 1; ; attempt++) {
      try {
        this._extensionId = await this._requestRegistration();
        return;
      } catch (err) {
        if (err instanceof PermanentRegistrationError) {
          throw err;
        }

        failingSince = failingSince === 0 ? Date.now() : failingSince;

        // The same ceiling the poll loop has, for the same reason: an extension Lambda launched
        // that never registers holds the init phase, and with it every invocation, for as long as
        // it keeps trying. Past this it is better to crash and let Lambda recycle.
        if (Date.now() - failingSince >= POLL_GIVE_UP_MS) {
          throw err;
        }

        if (attempt <= MAX_REPORTED_FAILURES) {
          logError('registering with the Extensions API failed, retrying.', err);
        }

        await sleep(retryDelayMs(attempt));
      }
    }
  }

  /**
   * Advances the extension to the next event and returns it.
   */
  public async next(): Promise<ExtensionEvent> {
    if (!this._extensionId) {
      throw new Error('Extension ID is not set');
    }

    const res = await request(`${this._baseUrl}/event/next`, {
      headers: {
        'Lambda-Extension-Identifier': this._extensionId,
        'Content-Type': 'application/json',
      },
    });

    // Reaching `end` without a status is a transport problem, not a verdict from the API, so it
    // must not carry a status into the terminal check.
    if (!res.statusCode) {
      throw new Error('The Extensions API response carried no status');
    }

    if (res.statusCode < 200 || res.statusCode > 299) {
      throw new ExtensionsApiError(`Failed to advance to next event: ${truncateBody(res.body)}`, res.statusCode);
    }

    const event: unknown = parseEvent(res.body);

    // `run` decides when to stop from `eventType`, and every JSON literal parses — `{}` included —
    // so anything without one would read as an event: counters reset, no backoff, immediate re-poll.
    if (typeof (event as ExtensionEvent | null)?.eventType !== 'string') {
      throw new Error(`The Extensions API returned no event: ${truncateBody(res.body)}`);
    }

    return event as ExtensionEvent;
  }

  /**
   * Polls the Extensions API until the environment shuts down.
   *
   * Giving up stops the loop rather than ending the process: subscribed to SHUTDOWN alone, an
   * extension that has stopped polling costs the customer nothing but this drain, while exiting
   * fails the invocation in flight as `Extension.Crash`. The outcome reports whether the API ever
   * took a poll, because that is not true yet during the init phase — see `main`.
   */
  public async run(): Promise<PollOutcome> {
    let failures = 0;
    let reported = 0;
    let terminalStatuses = 0;
    let failingSince = 0;
    let pollAccepted = false;

    for (;;) {
      const sentAt = Date.now();
      let event: ExtensionEvent;

      try {
        event = await this.next();
        // Before the contract check below, and deliberately weaker than the platform's own rule:
        // the init phase releases when the poll *reaches* the API, which a client cannot observe
        // once the transport dies. A resolved `next()` is the nearest thing it can see, so this
        // errs towards reporting the gate closed — see `main` for why that is the cheap direction.
        pollAccepted = true;

        // Nothing else was subscribed to, so this is the API answering outside its own contract.
        // Falling through would re-poll with no delay, and nothing rate-limits a loop that is no
        // longer in the invocation gate.
        if (event.eventType !== 'SHUTDOWN') {
          throw new Error(`The Extensions API delivered an unsubscribed event: ${event.eventType}`);
        }
      } catch (err) {
        const failedAt = Date.now();

        // The only health signal available: one poll covers the environment's whole life, so
        // "since the last event" would make every counter here a lifetime tally.
        if (failedAt - sentAt >= POLL_ESTABLISHED_MS) {
          failures = 0;
          terminalStatuses = 0;
          failingSince = 0;
        }

        failures++;
        // From the failure rather than `sentAt`, which on a parked poll predates the whole budget.
        failingSince = failingSince === 0 ? failedAt : failingSince;

        // Deliberately not reset by a non-terminal error: a permanent refusal that flaps with
        // transport failures would otherwise never confirm.
        if (isTerminalPollStatus(err)) {
          terminalStatuses++;
        }

        if (terminalStatuses >= TERMINAL_POLL_CONFIRMATIONS || failedAt - failingSince >= POLL_GIVE_UP_MS) {
          return { reason: 'unrecoverable', pollAccepted, error: err };
        }

        if (reported++ < MAX_REPORTED_FAILURES) {
          logError('polling the Extensions API failed, retrying.', err);
        }

        await sleep(retryDelayMs(failures));
        continue;
      }

      await this.drainPendingUploads(event.deadlineMs);
      return { reason: 'shutdown', pollAccepted };
    }
  }

  /**
   * Waits for envelopes the tunnel is still forwarding, up to the shutdown deadline.
   *
   * Lambda allows 2,000ms for shutdown and SIGKILLs whatever is left, billed to the function — so
   * idling the window costs the customer, and an upload in flight at teardown is simply lost.
   */
  public async drainPendingUploads(deadlineMs?: unknown): Promise<void> {
    const startedAt = Date.now();
    const until = startedAt + shutdownBudgetMs(deadlineMs);

    for (;;) {
      const now = Date.now();

      if (now >= until) {
        return;
      }

      // Resolves at once when nothing is in flight, so this doubles as the emptiness check.
      if (!(await this._tunnel.uploads.drain(until - now))) {
        return;
      }

      // Re-armed by each arrival, so a burst of exit flushes extends the wait rather than racing it.
      const idleFor = Math.max(startedAt, this._tunnel.lastActivityAt) + SHUTDOWN_IDLE_GRACE_MS - Date.now();

      if (idleFor <= 0) {
        return;
      }

      await sleep(Math.min(idleFor, until - Date.now()));
    }
  }

  /**
   * Starts the Sentry tunnel.
   */
  public startSentryTunnel(port: number = TUNNEL_PORT): http.Server {
    return this._tunnel.listen(port);
  }

  /** Resolves to the identifier every later poll carries. */
  private async _requestRegistration(): Promise<string> {
    const res = await request(`${this._baseUrl}/register`, {
      method: 'POST',
      body: JSON.stringify({ events: ['SHUTDOWN'] }),
      headers: {
        'Content-Type': 'application/json',
        'Lambda-Extension-Name': EXTENSION_NAME,
      },
    });

    if (res.statusCode < 200 || res.statusCode > 299) {
      throw new PermanentRegistrationError(`Failed to register with the extension API: ${truncateBody(res.body)}`);
    }

    const extensionId = res.headers['lambda-extension-identifier'];

    if (typeof extensionId !== 'string' || !extensionId) {
      throw new PermanentRegistrationError(
        'The Extensions API accepted the registration without returning an identifier',
      );
    }

    return extensionId;
  }
}
