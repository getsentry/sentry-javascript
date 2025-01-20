/* eslint-disable max-lines */
import { spawn, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { normalize } from '@sentry/core';
import type {
  ClientReport,
  Envelope,
  EnvelopeItemType,
  Event,
  EventEnvelope,
  SerializedCheckIn,
  SerializedSession,
  SessionAggregates,
  TransactionEvent,
} from '@sentry/core';
import axios from 'axios';
import {
  assertEnvelopeHeader,
  assertSentryCheckIn,
  assertSentryClientReport,
  assertSentryEvent,
  assertSentrySession,
  assertSentrySessions,
  assertSentryTransaction,
} from './assertions';
import { createBasicSentryServer } from './server';

const CLEANUP_STEPS = new Set<VoidFunction>();

export function cleanupChildProcesses(): void {
  for (const step of CLEANUP_STEPS) {
    step();
  }
  CLEANUP_STEPS.clear();
}

process.on('exit', cleanupChildProcesses);

/** Promise only resolves when fn returns true */
async function waitFor(fn: () => boolean, timeout = 10_000): Promise<void> {
  let remaining = timeout;
  while (fn() === false) {
    await new Promise<void>(resolve => setTimeout(resolve, 100));
    remaining -= 100;
    if (remaining < 0) {
      throw new Error('Timed out waiting for server port');
    }
  }
}

type VoidFunction = () => void;

interface DockerOptions {
  /**
   * The working directory to run docker compose in
   */
  workingDirectory: string[];
  /**
   * The strings to look for in the output to know that the docker compose is ready for the test to be run
   */
  readyMatches: string[];
}

/**
 * Runs docker compose up and waits for the readyMatches to appear in the output
 *
 * Returns a function that can be called to docker compose down
 */
async function runDockerCompose(options: DockerOptions): Promise<VoidFunction> {
  return new Promise((resolve, reject) => {
    const cwd = join(...options.workingDirectory);
    const close = (): void => {
      spawnSync('docker', ['compose', 'down', '--volumes'], {
        cwd,
        stdio: process.env.DEBUG ? 'inherit' : undefined,
      });
    };

    // ensure we're starting fresh
    close();

    const child = spawn('docker', ['compose', 'up'], { cwd });

    const timeout = setTimeout(() => {
      close();
      reject(new Error('Timed out waiting for docker-compose'));
    }, 75_000);

    function newData(data: Buffer): void {
      const text = data.toString('utf8');

      if (process.env.DEBUG) log(text);

      for (const match of options.readyMatches) {
        if (text.includes(match)) {
          child.stdout.removeAllListeners();
          clearTimeout(timeout);
          resolve(close);
        }
      }
    }

    child.stdout.on('data', newData);
    child.stderr.on('data', newData);
  });
}

type ExpectedEvent = Partial<Event> | ((event: Event) => void);
type ExpectedTransaction = Partial<TransactionEvent> | ((event: TransactionEvent) => void);
type ExpectedSession = Partial<SerializedSession> | ((event: SerializedSession) => void);
type ExpectedSessions = Partial<SessionAggregates> | ((event: SessionAggregates) => void);
type ExpectedCheckIn = Partial<SerializedCheckIn> | ((event: SerializedCheckIn) => void);
type ExpectedClientReport = Partial<ClientReport> | ((event: ClientReport) => void);

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
    };

type ExpectedEnvelopeHeader =
  | { event: Partial<EventEnvelope[0]> }
  | { transaction: Partial<Envelope[0]> }
  | { session: Partial<Envelope[0]> }
  | { sessions: Partial<Envelope[0]> };

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
  let withEnv: Record<string, string> = {};
  let withSentryServer = false;
  let dockerOptions: DockerOptions | undefined;
  let ensureNoErrorOutput = false;
  const logs: string[] = [];

  if (testPath.endsWith('.ts')) {
    flags.push('-r', 'ts-node/register');
  }

  return {
    expect: function (expected: Expected) {
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
    withEnv: function (env: Record<string, string>) {
      withEnv = env;
      return this;
    },
    withFlags: function (...args: string[]) {
      flags.push(...args);
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
    withDockerCompose: function (options: DockerOptions) {
      dockerOptions = options;
      return this;
    },
    ensureNoErrorOutput: function () {
      ensureNoErrorOutput = true;
      return this;
    },
    start: function (done?: (e?: unknown) => void) {
      const expectedEnvelopeCount = Math.max(expectedEnvelopes.length, (expectedEnvelopeHeaders || []).length);

      let envelopeCount = 0;
      let scenarioServerPort: number | undefined;
      let hasExited = false;
      let child: ReturnType<typeof spawn> | undefined;

      function complete(error?: Error): void {
        child?.kill();
        done?.(normalize(error));
      }

      /** Called after each expect callback to check if we're complete */
      function expectCallbackCalled(): void {
        envelopeCount++;
        if (envelopeCount === expectedEnvelopeCount) {
          complete();
        }
      }

      function newEnvelope(envelope: Envelope): void {
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
                throw new Error(`No more expected envelope items but we received ${JSON.stringify(header)}`);
              }

              assertEnvelopeHeader(header, expected);

              expectCallbackCalled();
            } catch (e) {
              complete(e as Error);
            }

            return;
          }

          const expected = expectedEnvelopes.shift();

          // Catch any error or failed assertions and pass them to done to end the test quickly
          try {
            if (!expected) {
              throw new Error(`No more expected envelope items but we received a '${envelopeItemType}' item`);
            }

            const expectedType = Object.keys(expected)[0];

            if (expectedType !== envelopeItemType) {
              throw new Error(`Expected envelope item type '${expectedType}' but got '${envelopeItemType}'`);
            }

            if ('event' in expected) {
              expectErrorEvent(item[1] as Event, expected.event);
              expectCallbackCalled();
            } else if ('transaction' in expected) {
              expectTransactionEvent(item[1] as TransactionEvent, expected.transaction);
              expectCallbackCalled();
            } else if ('session' in expected) {
              expectSessionEvent(item[1] as SerializedSession, expected.session);
              expectCallbackCalled();
            } else if ('sessions' in expected) {
              expectSessionsEvent(item[1] as SessionAggregates, expected.sessions);
              expectCallbackCalled();
            } else if ('check_in' in expected) {
              expectCheckInEvent(item[1] as SerializedCheckIn, expected.check_in);
              expectCallbackCalled();
            } else if ('client_report' in expected) {
              expectClientReport(item[1] as ClientReport, expected.client_report);
              expectCallbackCalled();
            } else {
              throw new Error(`Unhandled expected envelope item type: ${JSON.stringify(expected)}`);
            }
          } catch (e) {
            complete(e as Error);
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

      const startup = Promise.all([dockerStartup, serverStartup]) as Promise<[DockerStartup, ServerStartup]>;

      startup
        .then(([dockerChild, [mockServerPort, mockServerClose]]) => {
          if (mockServerClose) {
            CLEANUP_STEPS.add(() => {
              mockServerClose();
            });
          }

          if (dockerChild) {
            CLEANUP_STEPS.add(dockerChild);
          }

          const env = mockServerPort
            ? { ...process.env, ...withEnv, SENTRY_DSN: `http://public@localhost:${mockServerPort}/1337` }
            : { ...process.env, ...withEnv };

          if (process.env.DEBUG) log('starting scenario', testPath, flags, env.SENTRY_DSN);

          child = spawn('node', [...flags, testPath], { env });

          CLEANUP_STEPS.add(() => {
            child?.kill();
          });

          child.stderr?.on('data', (data: Buffer) => {
            const output = data.toString();
            logs.push(output.trim());

            if (process.env.DEBUG) log('stderr line', output);

            if (ensureNoErrorOutput) {
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
            const cleanedLine = line.replace(/^.*?] \[{"/, '[{"');

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
            } catch (_) {
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
        childHasExited: function (): boolean {
          return hasExited;
        },
        getLogs(): string[] {
          return logs;
        },
        makeRequest: async function <T>(
          method: 'get' | 'post',
          path: string,
          options: { headers?: Record<string, string>; data?: unknown; expectError?: boolean } = {},
        ): Promise<T | undefined> {
          try {
            await waitFor(() => scenarioServerPort !== undefined);
          } catch (e) {
            complete(e as Error);
            return;
          }

          const url = `http://localhost:${scenarioServerPort}${path}`;
          const data = options.data;
          const headers = options.headers || {};
          const expectError = options.expectError || false;

          if (process.env.DEBUG) log('making request', method, url, headers, data);

          try {
            const res =
              method === 'post' ? await axios.post(url, data, { headers }) : await axios.get(url, { headers });

            if (expectError) {
              complete(new Error(`Expected request to "${path}" to fail, but got a ${res.status} response`));
              return;
            }

            return res.data;
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

function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(...args.map(arg => normalize(arg)));
}

function expectErrorEvent(item: Event, expected: ExpectedEvent): void {
  if (typeof expected === 'function') {
    expected(item);
  } else {
    assertSentryEvent(item, expected);
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
