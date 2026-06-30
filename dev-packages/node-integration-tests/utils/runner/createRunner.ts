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
import { execSync, spawn, spawnSync } from 'child_process';
import { existsSync } from 'fs';
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

interface DockerOptions {
  /**
   * The working directory to run docker compose in
   */
  workingDirectory: string[];
  /**
   * The command to run after docker compose is up
   */
  setupCommand?: string;
}

type VoidFunction = () => void;

type ExpectedEvent = Partial<Event> | ((event: Event) => void);
type ExpectedTransaction = Partial<TransactionEvent> | ((event: TransactionEvent) => void);
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
  let dockerOptions: DockerOptions | undefined;
  let ensureNoErrorOutput = false;
  const logs: string[] = [];

  if (testPath.endsWith('.ts')) {
    flags.push('-r', 'ts-node/register');
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
      withEnv = env;
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
    withDockerCompose: function (options: DockerOptions) {
      dockerOptions = options;
      return this;
    },
    ensureNoErrorOutput: function () {
      if (expectedEnvelopes.length > 0) {
        throw new Error('You should not use `ensureNoErrorOutput` when using `expect`!');
      }
      ensureNoErrorOutput = true;
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

      function complete(error?: Error): void {
        if (isComplete) {
          return;
        }

        isComplete = true;
        completeError = error || undefined;
        child?.kill();
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

      // We need to properly define & pass these types around for TS 3.8,
      // which otherwise fails to infer these correctly :(
      type ServerStartup = [number | undefined, (() => void) | undefined];
      type DockerStartup = VoidFunction | undefined;

      const serverStartup: Promise<ServerStartup> = withSentryServer
        ? createBasicSentryServer(newEnvelope)
        : Promise.resolve([undefined, undefined]);

      const dockerStartup: Promise<DockerStartup> = dockerOptions
        ? runDockerCompose(dockerOptions)
        : Promise.resolve(undefined);

      const startup = Promise.all([dockerStartup, serverStartup]);

      startup
        .then(([dockerChild, [mockServerPort, mockServerClose]]) => {
          if (mockServerClose) {
            registerCleanupStep(() => {
              mockServerClose();
            });
          }

          if (dockerChild) {
            registerCleanupStep(dockerChild);
          }

          const env = mockServerPort
            ? { ...process.env, ...withEnv, SENTRY_DSN: `http://public@localhost:${mockServerPort}/1337` }
            : { ...process.env, ...withEnv };

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

          child.on('close', () => {
            hasExited = true;

            if (ensureNoErrorOutput) {
              complete();
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
          await waitFor(() => isComplete, 120_000, 'Timed out waiting for test to complete');

          if (completeError) {
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
            await waitFor(() => scenarioServerPort !== undefined, 10_000, 'Timed out waiting for server port');
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

/**
 * Runs `docker compose up -d --wait`, which blocks until every service's
 * healthcheck reports healthy. Each suite defines its healthcheck in its
 * own docker-compose.yml.
 *
 * Returns a function that can be called to docker compose down
 */
async function runDockerCompose(options: DockerOptions): Promise<VoidFunction> {
  const cwd = join(...options.workingDirectory);
  const close = (): void => {
    spawnSync('docker', ['compose', 'down', '--volumes'], {
      cwd,
      stdio: process.env.DEBUG ? 'inherit' : undefined,
    });
  };

  // ensure we're starting fresh
  close();

  const composeUp = (): ReturnType<typeof spawnSync> =>
    spawnSync('docker', ['compose', 'up', '-d', '--wait'], {
      cwd,
      stdio: process.env.DEBUG ? 'inherit' : 'pipe',
    });

  // `docker compose up` occasionally fails on CI with transient daemon races
  // (e.g. "failed to set up container networking: network <x>_default not
  // found" right after the network was created). A clean teardown plus retry
  // clears these, while genuine healthcheck failures stay red on every attempt.
  const maxAttempts = 3;
  let result = composeUp();
  for (let attempt = 1; attempt < maxAttempts && result.status !== 0; attempt++) {
    close();
    result = composeUp();
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() ?? '';
    const stdout = result.stdout?.toString() ?? '';
    // Surface container logs to make healthcheck failures easier to diagnose in CI
    const logs = spawnSync('docker', ['compose', 'logs'], { cwd }).stdout?.toString() ?? '';
    close();
    throw new Error(
      `docker compose up --wait failed (exit ${result.status})\n${stderr}${stdout}\n--- container logs ---\n${logs}`,
    );
  }

  if (options.setupCommand) {
    try {
      // Prepend local node_modules/.bin to PATH so additionalDependencies binaries take precedence
      const env = { ...process.env, PATH: `${cwd}/node_modules/.bin:${process.env.PATH}` };
      execSync(options.setupCommand, { cwd, stdio: 'inherit', env });
    } catch (e) {
      log('Error running docker setup command', e);
    }
  }

  return close;
}

/** Promise only resolves when fn returns true */
async function waitFor(fn: () => boolean, timeout = 10_000, message = 'Timed out waiting'): Promise<void> {
  let remaining = timeout;
  while (fn() === false) {
    await new Promise<void>(resolve => setTimeout(resolve, 100));
    remaining -= 100;
    if (remaining < 0) {
      throw new Error(message);
    }
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
