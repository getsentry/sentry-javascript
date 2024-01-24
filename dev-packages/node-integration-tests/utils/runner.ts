import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import { join } from 'path';
import type { Envelope, EnvelopeItemType, Event, SerializedSession } from '@sentry/types';
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

const CHILD_PROCESSES = new Set<ChildProcess>();

export function cleanupChildProcesses(): void {
  for (const child of CHILD_PROCESSES) {
    child.kill();
  }
}

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

type Expected =
  | {
      event: Partial<Event> | ((event: Event) => void);
    }
  | {
      transaction: Partial<Event> | ((event: Event) => void);
    }
  | {
      session: Partial<SerializedSession> | ((event: SerializedSession) => void);
    };

/** Creates a test runner */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createRunner(...paths: string[]) {
  const testPath = join(...paths);

  const expectedEnvelopes: Expected[] = [];
  const flags: string[] = [];
  const ignored: EnvelopeItemType[] = [];
  let withSentryServer = false;
  let ensureNoErrorOutput = false;

  if (testPath.endsWith('.ts')) {
    flags.push('-r', 'ts-node/register');
  }

  return {
    expect: function (expected: Expected) {
      expectedEnvelopes.push(expected);
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
    ensureNoErrorOutput: function () {
      ensureNoErrorOutput = true;
      return this;
    },
    start: function (done?: (e?: unknown) => void) {
      const expectedEnvelopeCount = expectedEnvelopes.length;

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
              const event = item[1] as Event;
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
          } catch (e) {
            complete(e as Error);
          }
        }
      }

      const serverStartup: Promise<number | undefined> = withSentryServer
        ? createBasicSentryServer(newEnvelope)
        : Promise.resolve(undefined);

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      serverStartup.then(mockServerPort => {
        const env = mockServerPort
          ? { ...process.env, SENTRY_DSN: `http://public@localhost:${mockServerPort}/1337` }
          : process.env;

        // eslint-disable-next-line no-console
        if (process.env.DEBUG) console.log('starting scenario', testPath, flags, env.SENTRY_DSN);

        child = spawn('node', [...flags, testPath], { env });

        CHILD_PROCESSES.add(child);

        if (ensureNoErrorOutput) {
          child.stderr.on('data', (data: Buffer) => {
            const output = data.toString();
            complete(new Error(`Expected no error output but got: '${output}'`));
          });
        }

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
        child.stdout.on('data', (data: Buffer) => {
          // This is horribly memory inefficient but it's only for tests
          buffer = Buffer.concat([buffer, data]);

          let splitIndex = -1;
          while ((splitIndex = buffer.indexOf(0xa)) >= 0) {
            const line = buffer.subarray(0, splitIndex).toString();
            buffer = Buffer.from(buffer.subarray(splitIndex + 1));
            // eslint-disable-next-line no-console
            if (process.env.DEBUG) console.log('line', line);
            tryParseEnvelopeFromStdoutLine(line);
          }
        });
      });

      return {
        childHasExited: function (): boolean {
          return hasExited;
        },
        makeRequest: async function <T>(
          method: 'get' | 'post',
          path: string,
          headers: Record<string, string> = {},
        ): Promise<T | undefined> {
          try {
            await waitFor(() => scenarioServerPort !== undefined);
          } catch (e) {
            complete(e as Error);
            return undefined;
          }

          const url = `http://localhost:${scenarioServerPort}${path}`;
          if (method === 'get') {
            return (await axios.get(url, { headers })).data;
          } else {
            return (await axios.post(url, { headers })).data;
          }
        },
      };
    },
  };
}
