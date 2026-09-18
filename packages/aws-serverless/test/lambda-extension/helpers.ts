import * as http from 'node:http';
import * as net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import type { AddressInfo } from 'node:net';
import { vi } from 'vitest';
import type { AwsLambdaExtension } from '../../src/lambda-extension/aws-lambda-extension';
import type { SentryTunnel } from '../../src/lambda-extension/sentry-tunnel';
import { SHUTDOWN_BUDGET_MS } from '../../src/lambda-extension/constants';
import type { PollOutcome } from '../../src/lambda-extension/types';

export async function listen(server: http.Server, host?: string): Promise<number> {
  await new Promise<void>(resolve => server.listen(0, host, resolve));
  return (server.address() as AddressInfo).port;
}

export function close(server: http.Server): Promise<void> {
  return new Promise(resolve => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
}

/** A loopback server whose URL and shutdown the caller does not have to assemble each time. */
export async function startServer(
  handler?: http.RequestListener,
): Promise<{ url: string; close: () => Promise<void>; server: http.Server }> {
  const server = handler ? http.createServer(handler) : http.createServer();
  const port = await listen(server, '127.0.0.1');

  return { url: `http://127.0.0.1:${port}/`, close: () => close(server), server };
}

export function spyOnExit() {
  return vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
}

export interface FakeExtensionsApi {
  close: () => Promise<void>;
}

/**
 * Stands in for the Lambda Extensions API. `/register` succeeds by default so tests can reach the
 * poll; both endpoints are delegated so each test decides how the API behaves.
 */
export async function startExtensionsApi(
  onNext: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  onRegister?: (req: http.IncomingMessage, res: http.ServerResponse, attempt: number) => void,
): Promise<FakeExtensionsApi> {
  let registrations = 0;

  const server = http.createServer((req, res) => {
    if (req.url?.endsWith('/register')) {
      if (onRegister) {
        onRegister(req, res, ++registrations);
        return;
      }

      res.writeHead(200, { 'lambda-extension-identifier': 'test-extension-id' });
      res.end('{}');
      return;
    }

    onNext(req, res);
  });

  process.env.AWS_LAMBDA_RUNTIME_API = `127.0.0.1:${await listen(server, '127.0.0.1')}`;

  return { close: () => close(server) };
}

/** For tests that never get as far as polling; reaching it means the test set itself up wrong. */
export function pollNotExpected(_req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end('the poll should not have been reached');
}

export type ScriptedPoll = { eventType?: string } | Error | { heldForMs: number; then: Error };

/**
 * Drives `run` through a fixed sequence of polls. A step is an event, a rejection, or a rejection
 * that only arrives once the poll has been held open — the shape `run` reads as an established
 * connection. Anything past the script is a SHUTDOWN, so a loop that fails to stop where the test
 * says it should reports the wrong outcome in milliseconds instead of spinning the worker.
 */
export function scriptPolls(
  extension: AwsLambdaExtension,
  script: ScriptedPoll[],
): { next: ReturnType<typeof vi.spyOn>; startedAt: number[] } {
  const startedAt: number[] = [];
  let poll = 0;

  const next = vi.spyOn(extension, 'next').mockImplementation(async () => {
    startedAt.push(Date.now());
    const step = script[poll++];

    if (step === undefined) {
      return { eventType: 'SHUTDOWN' };
    }
    if (step instanceof Error) {
      throw step;
    }
    if ('heldForMs' in step) {
      await new Promise(resolve => setTimeout(resolve, step.heldForMs));
      throw step.then;
    }
    return step;
  });

  return { next, startedAt };
}

/** Fake milliseconds to hand the loop; every backoff it can arm is well inside this. */
export const RUN_DRIVE_MS = 60_000;

/**
 * Runs the poll loop on the fake clock and reports how it ended. A loop that neither returns nor
 * rejects reads as `'still polling'` rather than as a suite timeout, so a regression that keeps
 * going fails with the outcome it produced.
 */
export async function runToOutcome(extension: AwsLambdaExtension, driveMs: number = RUN_DRIVE_MS): Promise<unknown> {
  let outcome: unknown = 'still polling';

  void extension.run().then(
    (result: PollOutcome) => {
      outcome = result;
    },
    (err: unknown) => {
      outcome = { threw: err };
    },
  );

  await vi.advanceTimersByTimeAsync(driveMs);
  await Promise.resolve();

  return outcome;
}

export function trackUpload(extension: AwsLambdaExtension, upload: Promise<unknown>): void {
  (extension as unknown as { _tunnel: SentryTunnel })._tunnel.uploads.add(() => upload);
}

export function recordTunnelActivity(extension: AwsLambdaExtension, at: number): void {
  (extension as unknown as { _tunnel: { _lastActivityAt: number } })._tunnel._lastActivityAt = at;
}

/** Past every window the drain can legitimately wait out. */
export const DRAIN_DRIVE_MS = SHUTDOWN_BUDGET_MS + 1_000;

/**
 * How long a drain took on the fake clock, or `'still draining'` when it never returned — a
 * deadline read as an epoch can leave the loop running, and awaiting that would surface as a suite
 * timeout instead of the budget the drain actually used.
 */
export async function drainedAfter(drain: Promise<void>, startedAt: number): Promise<number | string> {
  let elapsed: number | string = 'still draining';

  void drain.then(() => {
    elapsed = Date.now() - startedAt;
  });

  await vi.advanceTimersByTimeAsync(DRAIN_DRIVE_MS);
  await Promise.resolve();

  return elapsed;
}

export function activeTimers(): number {
  const inspect = (process as NodeJS.Process & { getActiveResourcesInfo?: () => string[] }).getActiveResourcesInfo;

  if (!inspect) {
    throw new Error('process.getActiveResourcesInfo is required to detect a leaked timer');
  }

  const resources: string[] = inspect.call(process);

  return resources.filter(resource => resource === 'Timeout').length;
}

/**
 * A timer an earlier test left armed would stand in for the leaked one below, so the measurement
 * only means anything from zero. Bounded generously: a keep-alive left by an earlier HTTP test was
 * measured clearing in about 1.3s.
 */
export async function waitForQuietTimers(): Promise<void> {
  for (let attempt = 0; attempt < 100 && activeTimers() > 0; attempt++) {
    await delay(50);
  }
}

export function collapseEveryDeadline(): void {
  const timer = globalThis.setTimeout;
  const interval = globalThis.setInterval;
  const socketDeadline = net.Socket.prototype.setTimeout;
  const abortDeadline = AbortSignal.timeout;

  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: () => void, _ms?: number, ...args: unknown[]) =>
    timer(handler, 0, ...args)) as unknown as typeof globalThis.setTimeout);
  vi.spyOn(globalThis, 'setInterval').mockImplementation(((handler: () => void, _ms?: number, ...args: unknown[]) =>
    interval(handler, 0, ...args)) as unknown as typeof globalThis.setInterval);
  vi.spyOn(net.Socket.prototype, 'setTimeout').mockImplementation(function (
    this: net.Socket,
    ms: number,
    callback?: () => void,
  ) {
    // Zero already means "no deadline"; arming one here would be the opposite of what was asked.
    return socketDeadline.call(this, ms === 0 ? 0 : 1, callback);
  });
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => abortDeadline.call(AbortSignal, 0));
}
