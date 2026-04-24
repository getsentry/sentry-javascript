import type { Envelope, EnvelopeItemType } from '@sentry/core';
import { normalize } from '@sentry/core';
import { createBasicSentryServer } from '@sentry-internal/test-utils';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { inspect } from 'util';
import { expect } from 'vitest';

const CLEANUP_STEPS = new Set<() => void>();

export function cleanupChildProcesses(): void {
  for (const step of CLEANUP_STEPS) {
    step();
  }
  CLEANUP_STEPS.clear();
}

process.on('exit', cleanupChildProcesses);

function deferredPromise<T = void>(
  done?: () => void,
): { resolve: (val: T) => void; reject: (reason?: unknown) => void; promise: Promise<T> } {
  let resolve;
  let reject;
  const promise = new Promise<T>((res, rej) => {
    resolve = (val: T) => {
      res(val);
    };
    reject = (reason: Error) => {
      rej(reason);
    };
  });
  if (!resolve || !reject) {
    throw new Error('Failed to create deferred promise');
  }
  return {
    resolve,
    reject,
    promise: promise.finally(() => done?.()),
  };
}

type Expected = Envelope | ((envelope: Envelope) => void);

type StartResult = {
  completed(): Promise<void>;
  makeRequest<T>(
    method: 'get' | 'post',
    path: string,
    options?: { headers?: Record<string, string>; data?: BodyInit; expectError?: boolean },
  ): Promise<T | undefined>;
};

/** Creates a test runner that spawns a Bun child process */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createRunner(...paths: string[]) {
  const testPath = join(...paths);

  let unordered = false;

  if (!existsSync(testPath)) {
    throw new Error(`Test scenario not found: ${testPath}`);
  }

  const expectedEnvelopes: Expected[] = [];
  const ignored: Set<EnvelopeItemType> = new Set(['session', 'sessions', 'client_report']);
  const envVars: Record<string, string> = {};

  return {
    withEnv: function (env: Record<string, string>) {
      Object.assign(envVars, env);
      return this;
    },
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
    unordered: function () {
      unordered = true;
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
    start: function (signal?: AbortSignal): StartResult {
      const { resolve, reject, promise: isComplete } = deferredPromise(cleanupChildProcesses);
      const expectedEnvelopeCount = expectedEnvelopes.length;

      let envelopeCount = 0;
      const { resolve: setServerPort, promise: serverPortPromise } = deferredPromise<number>();
      let child: ReturnType<typeof spawn> | undefined;

      function expectCallbackCalled(): void {
        envelopeCount++;
        if (envelopeCount === expectedEnvelopeCount) {
          resolve();
        }
      }

      function assertEnvelopeMatches(expected: Expected, envelope: Envelope): void {
        if (typeof expected === 'function') {
          expected(envelope);
        } else {
          expect(envelope).toEqual(expected);
        }
      }

      function newEnvelope(envelope: Envelope): void {
        if (process.env.DEBUG) log('newEnvelope', inspect(envelope, false, null, true));

        const envelopeItemType = envelope[1][0][0].type;

        if (ignored.has(envelopeItemType)) {
          return;
        }

        try {
          if (unordered) {
            const matchIndex = expectedEnvelopes.findIndex(candidate => {
              try {
                assertEnvelopeMatches(candidate, envelope);
                return true;
              } catch {
                return false;
              }
            });

            if (matchIndex < 0) {
              return;
            }

            expectedEnvelopes.splice(matchIndex, 1);
          } else {
            const expected = expectedEnvelopes.shift();

            if (!expected) {
              return;
            }

            assertEnvelopeMatches(expected, envelope);
          }

          expectCallbackCalled();
        } catch (e) {
          reject(e);
        }
      }

      createBasicSentryServer(newEnvelope)
        .then(([mockServerPort, mockServerClose]) => {
          if (mockServerClose) {
            CLEANUP_STEPS.add(() => {
              mockServerClose();
            });
          }

          if (process.env.DEBUG) log('Starting scenario', testPath);

          const entryFile = join(testPath, 'index.ts');
          if (!existsSync(entryFile)) {
            reject(new Error(`Entry file not found: ${entryFile}`));
            return;
          }

          const stdio: ('inherit' | 'ipc' | 'ignore' | 'pipe')[] = process.env.DEBUG
            ? ['inherit', 'inherit', 'inherit', 'ipc']
            : ['ignore', 'pipe', 'pipe', 'ipc'];

          child = spawn('bun', ['run', entryFile], {
            stdio,
            signal,
            env: {
              ...process.env,
              SENTRY_DSN: `http://public@localhost:${mockServerPort}/1337`,
              ...envVars,
            },
          });

          CLEANUP_STEPS.add(() => {
            child?.kill();
          });

          child.on('error', e => {
            // eslint-disable-next-line no-console
            console.error('Error starting Bun child process:', e);
            reject(e);
          });

          if (!process.env.DEBUG && child.stderr) {
            let stderrData = '';
            child.stderr.on('data', (chunk: Buffer) => {
              stderrData += chunk.toString();
            });
            child.on('exit', code => {
              if (code !== 0 && code !== null && stderrData) {
                // eslint-disable-next-line no-console
                console.error('Bun process stderr:', stderrData);
              }
            });
          }

          child.on('message', (message: string) => {
            const msg = JSON.parse(message) as { event: string; port?: number };
            if (msg.event === 'READY' && typeof msg.port === 'number') {
              if (process.env.DEBUG) log('Bun server ready on port', msg.port);
              setServerPort(msg.port);
            }
          });
        })
        .catch(e => reject(e));

      return {
        completed: async function (): Promise<void> {
          return isComplete;
        },
        makeRequest: async function <T>(
          method: 'get' | 'post',
          path: string,
          options: { headers?: Record<string, string>; data?: BodyInit; expectError?: boolean } = {},
        ): Promise<T | undefined> {
          const url = `http://localhost:${await serverPortPromise}${path}`;
          const body = options.data;
          const headers = options.headers || {};
          const expectError = options.expectError || false;

          if (process.env.DEBUG) log('making request', method, url, headers, body);

          try {
            const res = await fetch(url, { headers, method, body });

            if (!res.ok) {
              if (!expectError) {
                reject(new Error(`Expected request to "${path}" to succeed, but got a ${res.status} response`));
              }

              return;
            }

            if (expectError) {
              reject(new Error(`Expected request to "${path}" to fail, but got a ${res.status} response`));
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

            reject(e);
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
