/* eslint-disable max-lines */
import { spawn, spawnSync } from 'child_process';
import { join } from 'path';
import { SDK_VERSION } from '@sentry/node';
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
} from '@sentry/types';
import axios from 'axios';
import { createBasicSentryServer } from './server';

export function assertSentryEvent(actual: Event, expected: Event): void {
  expect(actual).toMatchObject({
    event_id: expect.any(String),
    ...expected,
  });
}

export function assertSentrySession(actual: SerializedSession, expected: Partial<SerializedSession>): void {
  expect(actual).toMatchObject({
    sid: expect.any(String),
    ...expected,
  });
}

export function assertSentryTransaction(actual: Event, expected: Partial<Event>): void {
  expect(actual).toMatchObject({
    event_id: expect.any(String),
    timestamp: expect.anything(),
    start_timestamp: expect.anything(),
    spans: expect.any(Array),
    type: 'transaction',
    ...expected,
  });
}

export function assertSentryCheckIn(actual: SerializedCheckIn, expected: Partial<SerializedCheckIn>): void {
  expect(actual).toMatchObject({
    check_in_id: expect.any(String),
    ...expected,
  });
}

export function assertSentryClientReport(actual: ClientReport, expected: Partial<ClientReport>): void {
  expect(actual).toMatchObject({
    ...expected,
  });
}

export function assertEnvelopeHeader(actual: Envelope[0], expected: Partial<Envelope[0]>): void {
  expect(actual).toEqual({
    event_id: expect.any(String),
    sent_at: expect.any(String),
    sdk: {
      name: 'sentry.javascript.node',
      version: SDK_VERSION,
    },
    ...expected,
  });
}

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

      // eslint-disable-next-line no-console
      if (process.env.DEBUG) console.log(text);

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

type Expected =
  | {
      event: Partial<Event> | ((event: Event) => void);
    }
  | {
      transaction: Partial<TransactionEvent> | ((event: TransactionEvent) => void);
    }
  | {
      session: Partial<SerializedSession> | ((event: SerializedSession) => void);
    }
  | {
      sessions: Partial<SessionAggregates> | ((event: SessionAggregates) => void);
    }
  | {
      check_in: Partial<SerializedCheckIn> | ((event: SerializedCheckIn) => void);
    }
  | {
      client_report: Partial<ClientReport> | ((event: ClientReport) => void);
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

  const expectedEnvelopes: Expected[] = [];
  let expectedEnvelopeHeaders: ExpectedEnvelopeHeader[] | undefined = undefined;
  const flags: string[] = [];
  // By default, we ignore session & sessions
  const ignored: EnvelopeItemType[] = ['session', 'sessions'];
  let withEnv: Record<string, string> = {};
  let withSentryServer = false;
  let dockerOptions: DockerOptions | undefined;
  let ensureNoErrorOutput = false;
  let expectError = false;
  const logs: string[] = [];

  if (testPath.endsWith('.ts')) {
    flags.push('-r', 'ts-node/register');
  }

  return {
    expect: function (expected: Expected) {
      expectedEnvelopes.push(expected);
      return this;
    },
    expectHeader: function (expected: ExpectedEnvelopeHeader) {
      if (!expectedEnvelopeHeaders) {
        expectedEnvelopeHeaders = [];
      }

      expectedEnvelopeHeaders.push(expected);
      return this;
    },
    expectError: function () {
      expectError = true;
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
      ignored.push(...types);
      return this;
    },
    unignore: function (...types: EnvelopeItemType[]) {
      for (const t of types) {
        const pos = ignored.indexOf(t);
        if (pos > -1) {
          ignored.splice(pos, 1);
        }
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
        done?.(error);
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

          if (ignored.includes(envelopeItemType)) {
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
              const event = item[1] as Event;
              if (typeof expected.event === 'function') {
                expected.event(event);
              } else {
                assertSentryEvent(event, expected.event);
              }

              expectCallbackCalled();
            }

            if ('transaction' in expected) {
              const event = item[1] as TransactionEvent;
              if (typeof expected.transaction === 'function') {
                expected.transaction(event);
              } else {
                assertSentryTransaction(event, expected.transaction);
              }

              expectCallbackCalled();
            }

            if ('session' in expected) {
              const session = item[1] as SerializedSession;
              if (typeof expected.session === 'function') {
                expected.session(session);
              } else {
                assertSentrySession(session, expected.session);
              }

              expectCallbackCalled();
            }

            if ('check_in' in expected) {
              const checkIn = item[1] as SerializedCheckIn;
              if (typeof expected.check_in === 'function') {
                expected.check_in(checkIn);
              } else {
                assertSentryCheckIn(checkIn, expected.check_in);
              }

              expectCallbackCalled();
            }

            if ('client_report' in expected) {
              const clientReport = item[1] as ClientReport;
              if (typeof expected.client_report === 'function') {
                expected.client_report(clientReport);
              } else {
                assertSentryClientReport(clientReport, expected.client_report);
              }

              expectCallbackCalled();
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

          // eslint-disable-next-line no-console
          if (process.env.DEBUG) console.log('starting scenario', testPath, flags, env.SENTRY_DSN);

          child = spawn('node', [...flags, testPath], { env });

          CLEANUP_STEPS.add(() => {
            child?.kill();
          });

          child.stderr?.on('data', (data: Buffer) => {
            const output = data.toString();
            logs.push(output.trim());

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
            // eslint-disable-next-line no-console
            if (process.env.DEBUG) console.log('scenario error', e);
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
              // eslint-disable-next-line no-console
              if (process.env.DEBUG) console.log('line', line);
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
          headers: Record<string, string> = {},
          data?: unknown,
        ): Promise<T | undefined> {
          try {
            await waitFor(() => scenarioServerPort !== undefined);
          } catch (e) {
            complete(e as Error);
            return undefined;
          }

          const url = `http://localhost:${scenarioServerPort}${path}`;
          if (expectError) {
            try {
              if (method === 'get') {
                await axios.get(url, { headers });
              } else {
                await axios.post(url, data, { headers });
              }
            } catch (e) {
              return;
            }
            return;
          } else if (method === 'get') {
            return (await axios.get(url, { headers })).data;
          } else {
            return (await axios.post(url, data, { headers })).data;
          }
        },
      };
    },
  };
}
