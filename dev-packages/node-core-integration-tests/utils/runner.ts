/* eslint-disable max-lines */
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
  SessionAggregates,
  TransactionEvent,
} from '@sentry/core';
import { normalize } from '@sentry/core';
import { execSync, spawn, spawnSync } from 'child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterAll, beforeAll, describe, test } from 'vitest';
import {
  assertEnvelopeHeader,
  assertSentryCheckIn,
  assertSentryClientReport,
  assertSentryEvent,
  assertSentryLogContainer,
  assertSentryMetricContainer,
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
  /**
   * The command to run after docker compose is up
   */
  setupCommand?: string;
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
          if (options.setupCommand) {
            execSync(options.setupCommand, { cwd, stdio: 'inherit' });
          }
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
type ExpectedLogContainer = Partial<SerializedLogContainer> | ((event: SerializedLogContainer) => void);
type ExpectedMetricContainer = Partial<SerializedMetricContainer> | ((event: SerializedMetricContainer) => void);

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
    };

type ExpectedEnvelopeHeader =
  | { event: Partial<EventEnvelope[0]> }
  | { transaction: Partial<Envelope[0]> }
  | { session: Partial<Envelope[0]> }
  | { sessions: Partial<Envelope[0]> }
  | { log: Partial<Envelope[0]> };

type StartResult = {
  completed(): Promise<void>;
  childHasExited(): boolean;
  getLogs(): string[];
  makeRequest<T>(
    method: 'get' | 'post',
    path: string,
    options?: { headers?: Record<string, string>; data?: BodyInit; expectError?: boolean },
  ): Promise<T | undefined>;
};

export function createEsmAndCjsTests(
  cwd: string,
  scenarioPath: string,
  instrumentPath: string,
  callback: (
    createTestRunner: () => ReturnType<typeof createRunner>,
    testFn: typeof test | typeof test.fails,
    mode: 'esm' | 'cjs',
  ) => void,
  options?: { failsOnCjs?: boolean; failsOnEsm?: boolean },
): void {
  const mjsScenarioPath = join(cwd, scenarioPath);
  const mjsInstrumentPath = join(cwd, instrumentPath);

  if (!mjsScenarioPath.endsWith('.mjs')) {
    throw new Error(`Scenario path must end with .mjs: ${scenarioPath}`);
  }

  if (!existsSync(mjsInstrumentPath)) {
    throw new Error(`Instrument file not found: ${mjsInstrumentPath}`);
  }

  const cjsScenarioPath = join(cwd, `tmp_${scenarioPath.replace('.mjs', '.cjs')}`);
  const cjsInstrumentPath = join(cwd, `tmp_${instrumentPath.replace('.mjs', '.cjs')}`);

  describe('esm', () => {
    const testFn = options?.failsOnEsm ? test.fails : test;
    callback(() => createRunner(mjsScenarioPath).withFlags('--import', mjsInstrumentPath), testFn, 'esm');
  });

  describe('cjs', () => {
    beforeAll(() => {
      // For the CJS runner, we create some temporary files...
      convertEsmFileToCjs(mjsScenarioPath, cjsScenarioPath);
      convertEsmFileToCjs(mjsInstrumentPath, cjsInstrumentPath);
    });

    afterAll(() => {
      try {
        unlinkSync(cjsInstrumentPath);
      } catch {
        // Ignore errors here
      }
      try {
        unlinkSync(cjsScenarioPath);
      } catch {
        // Ignore errors here
      }
    });

    const testFn = options?.failsOnCjs ? test.fails : test;
    callback(() => createRunner(cjsScenarioPath).withFlags('--require', cjsInstrumentPath), testFn, 'cjs');
  });
}

function convertEsmFileToCjs(inputPath: string, outputPath: string): void {
  const cjsFileContent = readFileSync(inputPath, 'utf8');
  const cjsFileContentConverted = convertEsmToCjs(cjsFileContent);
  writeFileSync(outputPath, cjsFileContentConverted);
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
            } else if ('log' in expected) {
              expectLog(item[1] as SerializedLogContainer, expected.log);
              expectCallbackCalled();
            } else if ('trace_metric' in expected) {
              expectMetric(item[1] as SerializedMetricContainer, expected.trace_metric);
              expectCallbackCalled();
            } else {
              throw new Error(
                `Unhandled expected envelope item type: ${JSON.stringify(expected)}\nItem: ${JSON.stringify(item)}`,
              );
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

      const startup = Promise.all([dockerStartup, serverStartup]);

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
        makeRequest: async function <T>(
          method: 'get' | 'post',
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
            const res = await fetch(url, { headers, method, body });

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

/**
 * Converts ESM import statements to CommonJS require statements
 * @param content The content of an ESM file
 * @returns The content with require statements instead of imports
 */
function convertEsmToCjs(content: string): string {
  let newContent = content;

  // Handle default imports: import x from 'y' -> const x = require('y')
  newContent = newContent.replace(
    // eslint-disable-next-line regexp/no-super-linear-backtracking, regexp/optimal-quantifier-concatenation
    /import\s+([\w*{}\s,]+)\s+from\s+['"]([^'"]+)['"]/g,
    (_, imports: string, module: string) => {
      if (imports.includes('* as')) {
        // Handle namespace imports: import * as x from 'y' -> const x = require('y')
        return `const ${imports.replace('* as', '').trim()} = require('${module}')`;
      } else if (imports.includes('{')) {
        // Handle named imports: import {x, y} from 'z' -> const {x, y} = require('z')
        return `const ${imports} = require('${module}')`;
      } else {
        // Handle default imports: import x from 'y' -> const x = require('y')
        return `const ${imports} = require('${module}')`;
      }
    },
  );

  // Handle side-effect imports: import 'x' -> require('x')
  newContent = newContent.replace(/import\s+['"]([^'"]+)['"]/g, (_, module) => {
    return `require('${module}')`;
  });

  return newContent;
}
