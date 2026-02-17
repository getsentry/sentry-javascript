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
import { createBasicSentryServer } from '@sentry-internal/test-utils';
import { exec, execSync, spawn, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { cp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { inspect, promisify } from 'util';
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

const execPromise = promisify(exec);

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
            try {
              // Prepend local node_modules/.bin to PATH so additionalDependencies binaries take precedence
              const env = { ...process.env, PATH: `${cwd}/node_modules/.bin:${process.env.PATH}` };
              execSync(options.setupCommand, { cwd, stdio: 'inherit', env });
            } catch (e) {
              log('Error running docker setup command', e);
            }
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
  getPort(): number | undefined;
  sendSignal(signal: NodeJS.Signals): void;
  makeRequest<T>(
    method: 'get' | 'post' | 'put' | 'delete' | 'patch',
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
    cwd: string,
  ) => void,
  options?: {
    failsOnCjs?: boolean;
    failsOnEsm?: boolean;
    /**
     * `additionalDependencies` to install in a tmp dir for the esm and cjs tests
     * This could be used to override packages that live in the parent package.json for the specific run of the test
     * e.g. `{ ai: '^5.0.0' }` to test Vercel AI v5
     */
    additionalDependencies?: Record<string, string>;
    /** Copy these files/dirs into the tmp dir. */
    copyPaths?: string[];
  },
): void {
  const mjsScenarioPath = join(cwd, scenarioPath);
  const mjsInstrumentPath = join(cwd, instrumentPath);

  if (!mjsScenarioPath.endsWith('.mjs')) {
    throw new Error(`Scenario path must end with .mjs: ${scenarioPath}`);
  }

  if (!existsSync(mjsInstrumentPath)) {
    throw new Error(`Instrument file not found: ${mjsInstrumentPath}`);
  }

  // Create a dedicated tmp directory that includes copied ESM & CJS scenario/instrument files.
  // If additionalDependencies are provided, we also create a nested package.json and install them there.
  const uniqueId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const tmpDirPath = join(cwd, `tmp_${uniqueId}`);
  const esmScenarioBasename = basename(scenarioPath);
  const esmInstrumentBasename = basename(instrumentPath);
  const esmScenarioPathForRun = join(tmpDirPath, esmScenarioBasename);
  const esmInstrumentPathForRun = join(tmpDirPath, esmInstrumentBasename);
  const cjsScenarioPath = join(tmpDirPath, esmScenarioBasename.replace('.mjs', '.cjs'));
  const cjsInstrumentPath = join(tmpDirPath, esmInstrumentBasename.replace('.mjs', '.cjs'));

  async function createTmpDir(): Promise<void> {
    await mkdir(tmpDirPath);

    // Copy ESM files as-is into tmp dir
    await writeFile(esmScenarioPathForRun, await readFile(mjsScenarioPath, 'utf8'));
    await writeFile(esmInstrumentPathForRun, await readFile(mjsInstrumentPath, 'utf8'));

    // Pre-create CJS converted files inside tmp dir
    await convertEsmFileToCjs(esmScenarioPathForRun, cjsScenarioPath);
    await convertEsmFileToCjs(esmInstrumentPathForRun, cjsInstrumentPath);

    // Copy any additional files/dirs into tmp dir
    if (options?.copyPaths) {
      for (const path of options.copyPaths) {
        await cp(join(cwd, path), join(tmpDirPath, path), { recursive: true });
      }
    }

    // Create a minimal package.json with requested dependencies (if any) and install them
    const additionalDependencies = options?.additionalDependencies ?? {};
    if (Object.keys(additionalDependencies).length > 0) {
      const packageJson = {
        name: 'tmp-integration-test',
        private: true,
        version: '0.0.0',
        dependencies: additionalDependencies,
      } as const;

      await writeFile(join(tmpDirPath, 'package.json'), JSON.stringify(packageJson, null, 2));

      try {
        const deps = Object.entries(additionalDependencies).map(([name, range]) => {
          if (!range || typeof range !== 'string') {
            throw new Error(`Invalid version range for "${name}": ${String(range)}`);
          }
          return `${name}@${range}`;
        });

        if (deps.length > 0) {
          try {
            // Prefer npm for temp installs to avoid Yarn engine strictness; see https://github.com/vercel/ai/issues/7777
            // We rely on the generated package.json dependencies and run a plain install.
            const { stdout, stderr } = await execPromise('npm install --silent --no-audit --no-fund', {
              cwd: tmpDirPath,
              encoding: 'utf8',
            });

            if (process.env.DEBUG) {
              // eslint-disable-next-line no-console
              console.log('[additionalDependencies via npm]', deps.join(' '));
              // eslint-disable-next-line no-console
              console.log('[npm stdout]', stdout);
              // eslint-disable-next-line no-console
              console.log('[npm stderr]', stderr);
            }
          } catch (error) {
            throw new Error(`Failed to install additionalDependencies in tmp dir ${tmpDirPath}: ${error}`);
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to install additionalDependencies:', e);
        throw e;
      }
    }
  }

  describe('esm/cjs', () => {
    const esmTestFn = options?.failsOnEsm ? test.fails : test;
    describe('esm', () => {
      callback(
        () => createRunner(esmScenarioPathForRun).withFlags('--import', esmInstrumentPathForRun),
        esmTestFn,
        'esm',
        tmpDirPath,
      );
    });

    const cjsTestFn = options?.failsOnCjs ? test.fails : test;
    describe('cjs', () => {
      callback(
        () => createRunner(cjsScenarioPath).withFlags('--require', cjsInstrumentPath),
        cjsTestFn,
        'cjs',
        tmpDirPath,
      );
    });

    // Create tmp directory
    beforeAll(async () => {
      await createTmpDir();
    }, 60_000);

    // Clean up the tmp directory after both esm and cjs suites have run
    afterAll(async () => {
      // First do cleanup!
      cleanupChildProcesses();

      try {
        await rm(tmpDirPath, { recursive: true, force: true });
      } catch {
        if (process.env.DEBUG) {
          // eslint-disable-next-line no-console
          console.error(`Failed to remove tmp dir: ${tmpDirPath}`);
        }
      }
    }, 30_000);
  });
}

async function convertEsmFileToCjs(inputPath: string, outputPath: string): Promise<void> {
  const cjsFileContent = await readFile(inputPath, 'utf8');
  const cjsFileContentConverted = convertEsmToCjs(cjsFileContent);
  return writeFile(outputPath, cjsFileContentConverted);
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

          child.on('error', e => {
            // eslint-disable-next-line no-console
            console.error('Error starting child process:', e);
            complete(e);
          });

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
    // eslint-disable-next-line regexp/optimal-quantifier-concatenation, regexp/no-super-linear-backtracking
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
