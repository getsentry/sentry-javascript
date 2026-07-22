import type {
  ClientReport,
  Envelope,
  EnvelopeItemType,
  Event,
  EventEnvelope,
  SerializedCheckIn,
  SerializedLogContainer,
  SerializedMetricContainer,
  SerializedSession,
  SerializedStreamedSpanContainer,
  SessionAggregates,
  TransactionEvent,
} from '@sentry/core';
import { normalize } from '@sentry/core';
import { createBasicSentryServer } from '@sentry-internal/test-utils';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { inspect } from 'util';
import type { DeepPartial } from './../assertions';
import {
  assertEnvelopeHeader,
  assertSentryCheckIn,
  assertSentryClientReport,
  assertSentryEvent,
  assertSentryLogContainer,
  assertSentryMetricContainer,
  assertSentrySession,
  assertSentrySessions,
  assertSentrySpanContainer,
  assertSentryTransaction,
  assertSpanEnvelopeHeader,
} from './../assertions';

type VoidFunction = () => void;

type ExpectedEvent = Partial<Event> | ((event: Event) => void);
type ExpectedTransaction = DeepPartial<TransactionEvent> | ((event: TransactionEvent) => void);
type ExpectedSession = Partial<SerializedSession> | ((event: SerializedSession) => void);
type ExpectedSessions = Partial<SessionAggregates> | ((event: SessionAggregates) => void);
type ExpectedCheckIn = Partial<SerializedCheckIn> | ((event: SerializedCheckIn) => void);
type ExpectedClientReport = Partial<ClientReport> | ((event: ClientReport) => void);
type ExpectedLogContainer = Partial<SerializedLogContainer> | ((event: SerializedLogContainer) => void);
type ExpectedMetricContainer = Partial<SerializedMetricContainer> | ((event: SerializedMetricContainer) => void);
type ExpectedSpanContainer =
  | DeepPartial<SerializedStreamedSpanContainer>
  | ((container: SerializedStreamedSpanContainer) => void);

type Expected =
  | {
      event: ExpectedEvent;
    }
  | {
      transaction: ExpectedTransaction;
    }
  | {
      session: ExpectedSession;
    }
  | {
      sessions: ExpectedSessions;
    }
  | {
      check_in: ExpectedCheckIn;
    }
  | {
      client_report: ExpectedClientReport;
    }
  | {
      log: ExpectedLogContainer;
    }
  | {
      trace_metric: ExpectedMetricContainer;
    }
  | {
      span: ExpectedSpanContainer;
    };

type ExpectedEnvelopeHeader =
  | { event: Partial<EventEnvelope[0]> }
  | { transaction: Partial<Envelope[0]> }
  | { session: Partial<Envelope[0]> }
  | { sessions: Partial<Envelope[0]> }
  | { log: Partial<Envelope[0]> }
  | { span: Partial<Envelope[0]> };

type StartResult = {
  completed(): Promise<void>;
  childHasExited(): boolean;
  getLogs(): string[];
  getPort(): number | undefined;
  sendSignal(signal: NodeJS.Signals): void;
  makeRequest<T>(
    method: 'get' | 'post' | 'put' | 'delete' | 'patch',
    path: string,
    options?: { headers?: Record<string, string>; data?: BodyInit; expectError?: boolean },
  ): Promise<T | undefined>;
};

// Node's on-disk V8 compile cache (Node 22+) cuts the repeated cost of parsing/compiling the
// `@sentry/node` + OpenTelemetry module graph that every scenario child loads from scratch. We
// point all child processes at one shared cache dir, so the first child populates it and the
// rest reuse it. `NODE_COMPILE_CACHE` is silently ignored on Node < 22, so gating on the
// parent's major version (the same `node` binary the children run) just avoids creating an
// unused dir there. A user-set `NODE_COMPILE_CACHE` in the environment takes precedence.
const NODE_MAJOR = Number(process.versions.node.split('.')[0]);
const COMPILE_CACHE_ENV: Record<string, string> =
  NODE_MAJOR >= 22 ? { NODE_COMPILE_CACHE: join(tmpdir(), 'sentry-node-it-compile-cache') } : {};

export const CLEANUP_STEPS = new Set<VoidFunction>();

export function cleanupChildProcesses(): void {
  for (const step of CLEANUP_STEPS) {
    step();
  }
  CLEANUP_STEPS.clear();
}

/** Creates a test runner */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createRunner(...paths: string[]) {
  const testPath = join(...paths);

  if (!existsSync(testPath)) {
    throw new Error(`Test scenario not found: ${testPath}`);
  }

  const expectedEnvelopes: Expected[] = [];
  let expectedEnvelopeHeaders: ExpectedEnvelopeHeader[] | undefined = undefined;
  const flags: string[] = [];
  // By default, we ignore session & sessions
  const ignored: Set<EnvelopeItemType> = new Set(['session', 'sessions', 'client_report']);
  let unordered = false;
  let withEnv: Record<string, string> = {};
  let withSentryServer = false;
  let ensureNoErrorOutput = false;
  // When set, the test using this runner expects `completed()` to reject (e.g. `test.fails` variants
  // created via `createEsmAndCjsTests` with `failsOnEsm`/`failsOnCjs`). We suppress the captured-log
  // dump in that case, since the failure is expected and the output would just be noise.
  let suppressErrorLogs = false;
  const logs: string[] = [];

  if (testPath.endsWith('.ts')) {
    // Load .ts scenarios through tsx's CommonJS require hook (not `--import tsx`, the ESM loader).
    // These scenarios are CJS; `--import` routes them through Node's ESM machinery, which on Node
    // 22+ gives the scenario a different `@sentry/node` instance than the CJS instrument/auto-flush,
    // so instrumentation and flushing target the wrong SDK object. The require hook keeps one CJS
    // instance, matching how ts-node loaded them.
    flags.push('-r', 'tsx/cjs');
  }

  // Cleanup steps registered by this specific runner (child process, docker, mock server). They are
  // also added to the global `CLEANUP_STEPS` so the `process.on('exit')` backstop still covers them,
  // but tracking them per-runner lets `cleanup()` tear down only this runner's resources.
  const runnerCleanupSteps = new Set<VoidFunction>();
  function registerCleanupStep(step: VoidFunction): void {
    runnerCleanupSteps.add(step);
    CLEANUP_STEPS.add(step);
  }

  return {
    /** Run (and de-register) only the cleanup steps registered by this runner. */
    cleanup: function (): void {
      for (const step of runnerCleanupSteps) {
        step();
        CLEANUP_STEPS.delete(step);
      }
      runnerCleanupSteps.clear();
    },
    expect: function (expected: Expected) {
      if (ensureNoErrorOutput) {
        throw new Error('You should not use `ensureNoErrorOutput` when using `expect`!');
      }
      expectedEnvelopes.push(expected);
      return this;
    },
    expectN: function (n: number, expected: Expected) {
      for (let i = 0; i < n; i++) {
        expectedEnvelopes.push(expected);
      }
      return this;
    },
    expectHeader: function (expected: ExpectedEnvelopeHeader) {
      if (!expectedEnvelopeHeaders) {
        expectedEnvelopeHeaders = [];
      }

      expectedEnvelopeHeaders.push(expected);
      return this;
    },
    expectMetricEnvelope: function () {
      // Unignore metric envelopes
      ignored.delete('metric');
      return this;
    },
    withEnv: function (env: Record<string, string>) {
      withEnv = {
        ...withEnv,
        ...env,
      };
      return this;
    },
    withFlags: function (...args: string[]) {
      flags.push(...args);
      return this;
    },
    withInstrument: function (instrumentPath: string) {
      flags.push('--import', instrumentPath);
      return this;
    },
    withMockSentryServer: function () {
      withSentryServer = true;
      return this;
    },
    ignore: function (...types: EnvelopeItemType[]) {
      types.forEach(t => ignored.add(t));
      return this;
    },
    unignore: function (...types: EnvelopeItemType[]) {
      for (const t of types) {
        ignored.delete(t);
      }
      return this;
    },
    unordered: function () {
      unordered = true;
      return this;
    },
    ensureNoErrorOutput: function () {
      if (expectedEnvelopes.length > 0) {
        throw new Error('You should not use `ensureNoErrorOutput` when using `expect`!');
      }
      ensureNoErrorOutput = true;
      return this;
    },
    /**
     * Mark this runner's test as expected to fail (i.e. `completed()` is expected to reject).
     * Suppresses the captured-log dump so expected failures don't emit noisy output.
     */
    suppressErrorLogs: function () {
      suppressErrorLogs = true;
      return this;
    },
    start: function (): StartResult {
      let isComplete = false;
      let completeError: Error | undefined;

      const expectedEnvelopeCount = Math.max(expectedEnvelopes.length, (expectedEnvelopeHeaders || []).length);

      let envelopeCount = 0;
      let scenarioServerPort: number | undefined;
      let hasExited = false;
      let child: ReturnType<typeof spawn> | undefined;

      // Resolved the moment `complete()` runs, so `completed()` can await the result directly
      // instead of polling — see the comment on `waitForEvent`.
      const completedDeferred = createDeferred();
      // Resolved once the scenario reports its server port, so `makeRequest` can await it directly.
      const portReady = createDeferred();

      function complete(error?: Error): void {
        if (isComplete) {
          return;
        }

        isComplete = true;
        completeError = error || undefined;
        child?.kill();
        completedDeferred.resolve();
      }

      /**
       * Print everything the child process wrote to stdout/stderr. Called when a test fails or
       * times out so the captured output is visible in CI logs. Skipped when `DEBUG` is set, since
       * that already streams the same lines live as they arrive.
       */
      function dumpCapturedLogs(): void {
        // Skip when the failure is expected (`test.fails` variants) — the output would just be noise.
        // In debug mode the same lines are already streamed live, so skip then too.
        if (process.env.DEBUG || suppressErrorLogs) {
          return;
        }

        // eslint-disable-next-line no-console
        console.log(`\n--- Captured child process output for ${testPath} ---`);
        if (logs.length === 0) {
          // eslint-disable-next-line no-console
          console.log('(no output captured)');
        } else {
          for (const line of logs) {
            // eslint-disable-next-line no-console
            console.log(line);
          }
        }
        // eslint-disable-next-line no-console
        console.log('--- End of captured child process output ---\n');
      }

      /** Called after each expect callback to check if we're complete */
      function expectCallbackCalled(): void {
        envelopeCount++;
        if (envelopeCount === expectedEnvelopeCount) {
          complete();
        }
      }

      function newEnvelope(envelope: Envelope): void {
        if (process.env.DEBUG) log('newEnvelope', inspect(envelope, false, null, true));

        for (const item of envelope[1]) {
          const envelopeItemType = item[0].type;

          if (ignored.has(envelopeItemType)) {
            continue;
          }

          if (expectedEnvelopeHeaders) {
            const header = envelope[0];
            const expected = expectedEnvelopeHeaders.shift()?.[envelopeItemType as keyof ExpectedEnvelopeHeader];

            try {
              if (!expected) {
                return;
              }

              if (envelopeItemType === 'span') {
                assertSpanEnvelopeHeader(header, expected);
              } else {
                assertEnvelopeHeader(header, expected);
              }

              expectCallbackCalled();
            } catch (e) {
              complete(e as Error);
            }

            return;
          }

          if (unordered) {
            const matchIndex = expectedEnvelopes.findIndex(candidate => {
              const candidateType = Object.keys(candidate)[0];
              if (candidateType !== envelopeItemType) {
                return false;
              }
              try {
                assertExpectedEnvelope(candidate, item);
                return true;
              } catch {
                return false;
              }
            });

            if (matchIndex < 0) {
              return;
            }

            expectedEnvelopes.splice(matchIndex, 1);
            expectCallbackCalled();
          } else {
            const expected = expectedEnvelopes.shift();

            // Catch any error or failed assertions and pass them to done to end the test quickly
            try {
              if (!expected) {
                return;
              }

              const expectedType = Object.keys(expected)[0];

              if (expectedType !== envelopeItemType) {
                throw new Error(
                  `Expected envelope item type '${expectedType}' but got '${envelopeItemType}'. \nItem: ${JSON.stringify(
                    item,
                  )}`,
                );
              }

              assertExpectedEnvelope(expected, item);
              expectCallbackCalled();
            } catch (e) {
              complete(e as Error);
            }
          }
        }
      }

      type ServerStartup = [number | undefined, (() => void) | undefined];

      const serverStartup: Promise<ServerStartup> = withSentryServer
        ? createBasicSentryServer(newEnvelope)
        : Promise.resolve([undefined, undefined]);

      serverStartup
        .then(([mockServerPort, mockServerClose]) => {
          if (mockServerClose) {
            registerCleanupStep(() => {
              mockServerClose();
            });
          }

          const env = mockServerPort
            ? {
                ...COMPILE_CACHE_ENV,
                ...process.env,
                ...withEnv,
                SENTRY_DSN: `http://public@localhost:${mockServerPort}/1337`,
              }
            : { ...COMPILE_CACHE_ENV, ...process.env, ...withEnv };

          if (process.env.DEBUG) log('starting scenario', testPath, flags, env.SENTRY_DSN);

          // Inject auto-flush hooks so scenarios don't need
          // `setInterval(() => {}, 1000)` boilerplate. Each script registers a
          // `beforeExit` listener that calls `Sentry.flush()` — the awaited
          // flush keeps the event loop alive until queued envelopes reach the
          // transport, then the process exits naturally.
          //
          // We inject the matching loader for the scenario's module system
          // (detected by whether `flags` already contains `--import` for the
          // instrument file). For ESM scenarios we use `--import auto-flush.mjs`
          // so the `import * as Sentry` resolves to the same SDK instance the
          // scenario uses; for CJS we use `--require auto-flush.cjs`.
          //
          // Skipped when no envelopes are expected — these tests (e.g. ANR
          // `should-exit`, `ensureNoErrorOutput`) verify the child exits
          // naturally and auto-flush would delay that with retrying HTTP
          // requests to the fake DSN.
          const wantsAutoFlush =
            !ensureNoErrorOutput && (expectedEnvelopes.length > 0 || (expectedEnvelopeHeaders?.length ?? 0) > 0);
          const childFlags = wantsAutoFlush ? [...buildAutoFlushFlags(flags), ...flags] : flags;

          child = spawn('node', [...childFlags, testPath], { env });

          child.on('error', e => {
            // eslint-disable-next-line no-console
            console.error('Error starting child process:', e);
            complete(e);
          });

          registerCleanupStep(() => {
            child?.kill();
          });

          child.stderr?.on('data', (data: Buffer) => {
            const output = data.toString();
            logs.push(output.trim());

            if (process.env.DEBUG) log('stderr line', output);

            // Ignore deprecation warnings for this purpose
            if (ensureNoErrorOutput && !`${output}`.includes('DeprecationWarning:')) {
              complete(new Error(`Expected no error output but got: '${output}'`));
            }
          });

          child.on('close', (code, signal) => {
            hasExited = true;

            if (ensureNoErrorOutput) {
              complete();
              return;
            }

            // A scenario that still owes envelopes but has already exited will never deliver them.
            // Without this, `completed()` blocks until the vitest test timeout and reports an opaque
            // "Test timed out", hiding the real failure (e.g. the scenario threw before sending its
            // transaction — an unhandled rejection exits the process with no envelope). Complete with
            // the exit status and how far we got so the failure is fast and diagnosable; the captured
            // child output is dumped by `completed()`. In the success path `complete()` has already
            // run (so `isComplete` short-circuits this), server-style tests are killed by `complete()`
            // first, and tests that expect no envelopes drive completion some other way.
            if (!isComplete && expectedEnvelopeCount > 0) {
              const how = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`;
              complete(
                new Error(
                  `Scenario exited (${how}) after ${envelopeCount}/${expectedEnvelopeCount} expected ` +
                    'envelope(s), before the test completed.',
                ),
              );
            }
          });

          // Pass error to done to end the test quickly
          child.on('error', e => {
            if (process.env.DEBUG) log('scenario error', e);
            complete(e);
          });

          function tryParseEnvelopeFromStdoutLine(line: string): void {
            // Lines can have leading '[something] [{' which we need to remove
            const cleanedLine = line.replace(/^.*?\] \[\{"/, '[{"');

            // See if we have a port message
            if (cleanedLine.startsWith('{"port":')) {
              const { port } = JSON.parse(cleanedLine) as { port: number };
              scenarioServerPort = port;
              portReady.resolve();
              return;
            }

            // Skip any lines that don't start with envelope JSON
            if (!cleanedLine.startsWith('[{')) {
              return;
            }

            try {
              const envelope = JSON.parse(cleanedLine) as Envelope;
              newEnvelope(envelope);
            } catch {
              //
            }
          }

          let buffer = Buffer.alloc(0);
          child.stdout?.on('data', (data: Buffer) => {
            // This is horribly memory inefficient but it's only for tests
            buffer = Buffer.concat([buffer, data]);

            let splitIndex = -1;
            while ((splitIndex = buffer.indexOf(0xa)) >= 0) {
              const line = buffer.subarray(0, splitIndex).toString();
              logs.push(line.trim());

              buffer = Buffer.from(buffer.subarray(splitIndex + 1));
              if (process.env.DEBUG) log('line', line);
              tryParseEnvelopeFromStdoutLine(line);
            }
          });
        })
        .catch(e => complete(e));

      return {
        completed: async function (): Promise<void> {
          try {
            await waitForEvent(completedDeferred.promise, 120_000, 'Timed out waiting for test to complete');
          } catch (e) {
            // On timeout, dump the captured child output (same info `DEBUG=1` would have streamed live)
            // so CI failures are diagnosable without re-running locally with DEBUG enabled.
            dumpCapturedLogs();
            throw e;
          }

          if (completeError) {
            // Same rationale as the timeout branch: surface what the child actually logged before failing.
            dumpCapturedLogs();
            throw completeError;
          }
        },
        childHasExited: function (): boolean {
          return hasExited;
        },
        getLogs(): string[] {
          return logs;
        },
        getPort(): number | undefined {
          return scenarioServerPort;
        },
        sendSignal(signal: NodeJS.Signals): void {
          child?.kill(signal);
        },
        makeRequest: async function <T>(
          method: 'get' | 'post' | 'put' | 'delete' | 'patch',
          path: string,
          options: { headers?: Record<string, string>; data?: BodyInit; expectError?: boolean } = {},
        ): Promise<T | undefined> {
          try {
            await waitForEvent(portReady.promise, 10_000, 'Timed out waiting for server port');
          } catch (e) {
            complete(e as Error);
            return;
          }

          const url = `http://localhost:${scenarioServerPort}${path}`;
          const body = options.data;
          const headers = options.headers || {};
          const expectError = options.expectError || false;

          if (process.env.DEBUG) log('making request', method, url, headers, body);

          try {
            const res = await fetch(url, { headers, method: method.toUpperCase(), body });

            if (!res.ok) {
              if (!expectError) {
                complete(new Error(`Expected request to "${path}" to succeed, but got a ${res.status} response`));
              }

              return;
            }

            if (expectError) {
              complete(new Error(`Expected request to "${path}" to fail, but got a ${res.status} response`));
              return;
            }

            if (res.headers.get('content-type')?.includes('application/json')) {
              return await res.json();
            }

            return (await res.text()) as T;
          } catch (e) {
            if (expectError) {
              return;
            }

            complete(e as Error);
            return;
          }
        },
      };
    },
  };
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

/** A promise plus its resolver, so producers can signal completion without polling. */
function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * Resolves as soon as `event` resolves, or rejects with `message` after `timeout` ms. This
 * replaces the previous 100ms-granularity polling loop: `complete()` (and the server-port
 * parser) resolve their deferred synchronously the instant they have a result, so tests no
 * longer wait up to a full poll tick after the child is actually done.
 */
async function waitForEvent(event: Promise<void>, timeout: number, message: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeout);
  });
  try {
    await Promise.race([event, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(...args.map(arg => normalize(arg)));
}

/**
 * Returns Node flags that inject the auto-flush loader matching the scenario's
 * module system. ESM scenarios already have `--import` for the instrument
 * file — we mirror that with `--import auto-flush.mjs` so both resolve to the
 * same `@sentry/node` instance. Otherwise we fall back to `--require
 * auto-flush.cjs`.
 *
 * Node accepts both `--import foo` (two array elements, e.g. `withInstrument`
 * or `withFlags('--import', foo)`) and `--import=foo` (one element, e.g.
 * `withFlags('--import=@sentry/node/init')` in `suites/no-code/test.ts`); we
 * have to recognise both, otherwise the missed form silently gets
 * `auto-flush.cjs` and the flush targets the wrong SDK instance.
 */
function buildAutoFlushFlags(existingFlags: readonly string[]): string[] {
  const isEsm = existingFlags.some(flag => flag === '--import' || flag.startsWith('--import='));
  if (isEsm) {
    return ['--import', join(__dirname, 'auto-flush.mjs')];
  }
  return ['--require', join(__dirname, 'auto-flush.cjs')];
}

function expectErrorEvent(item: Event, expected: ExpectedEvent): void {
  if (typeof expected === 'function') {
    expected(item);
  } else {
    assertSentryEvent(item, expected);
  }
}

function assertExpectedEnvelope(expected: Expected, item: Envelope[1][number]): void {
  if ('event' in expected) {
    expectErrorEvent(item[1] as Event, expected.event);
  } else if ('transaction' in expected) {
    expectTransactionEvent(item[1] as TransactionEvent, expected.transaction);
  } else if ('session' in expected) {
    expectSessionEvent(item[1] as SerializedSession, expected.session);
  } else if ('sessions' in expected) {
    expectSessionsEvent(item[1] as SessionAggregates, expected.sessions);
  } else if ('check_in' in expected) {
    expectCheckInEvent(item[1] as SerializedCheckIn, expected.check_in);
  } else if ('client_report' in expected) {
    expectClientReport(item[1] as ClientReport, expected.client_report);
  } else if ('log' in expected) {
    expectLog(item[1] as SerializedLogContainer, expected.log);
  } else if ('trace_metric' in expected) {
    expectMetric(item[1] as SerializedMetricContainer, expected.trace_metric);
  } else if ('span' in expected) {
    expectSpanContainer(item[1] as SerializedStreamedSpanContainer, expected.span);
  } else {
    throw new Error(
      `Unhandled expected envelope item type: ${JSON.stringify(expected)}\nItem: ${JSON.stringify(item)}`,
    );
  }
}

function expectTransactionEvent(item: TransactionEvent, expected: ExpectedTransaction): void {
  if (typeof expected === 'function') {
    expected(item);
  } else {
    assertSentryTransaction(item, expected);
  }
}

function expectSessionEvent(item: SerializedSession, expected: ExpectedSession): void {
  if (typeof expected === 'function') {
    expected(item);
  } else {
    assertSentrySession(item, expected);
  }
}

function expectSessionsEvent(item: SessionAggregates, expected: ExpectedSessions): void {
  if (typeof expected === 'function') {
    expected(item);
  } else {
    assertSentrySessions(item, expected);
  }
}

function expectCheckInEvent(item: SerializedCheckIn, expected: ExpectedCheckIn): void {
  if (typeof expected === 'function') {
    expected(item);
  } else {
    assertSentryCheckIn(item, expected);
  }
}

function expectClientReport(item: ClientReport, expected: ExpectedClientReport): void {
  if (typeof expected === 'function') {
    expected(item);
  } else {
    assertSentryClientReport(item, expected);
  }
}

function expectLog(item: SerializedLogContainer, expected: ExpectedLogContainer): void {
  if (typeof expected === 'function') {
    expected(item);
  } else {
    assertSentryLogContainer(item, expected);
  }
}

function expectMetric(item: SerializedMetricContainer, expected: ExpectedMetricContainer): void {
  if (typeof expected === 'function') {
    expected(item);
  } else {
    assertSentryMetricContainer(item, expected);
  }
}

function expectSpanContainer(item: SerializedStreamedSpanContainer, expected: ExpectedSpanContainer): void {
  if (typeof expected === 'function') {
    expected(item);
  } else {
    assertSentrySpanContainer(item, expected);
  }
}
