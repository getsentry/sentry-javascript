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

/** Creates a test runner */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createRunner(...paths: string[]) {
  const testPath = join(...paths);

  // controls whether envelopes are expected in predefined order or not
  let unordered = false;

  if (!existsSync(testPath)) {
    throw new Error(`Test scenario not found: ${testPath}`);
  }

  const expectedEnvelopes: Expected[] = [];
  // By default, we ignore session & sessions
  const ignored: Set<EnvelopeItemType> = new Set(['session', 'sessions', 'client_report']);
  let serverUrl: string | undefined;

  return {
    withServerUrl: function (url: string) {
      serverUrl = url;
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
      const { resolve: setWorkerPort, promise: workerPortPromise } = deferredPromise<number>();
      let child: ReturnType<typeof spawn> | undefined;

      /** Called after each expect callback to check if we're complete */
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
            // find any matching expected envelope
            const matchIndex = expectedEnvelopes.findIndex(candidate => {
              try {
                assertEnvelopeMatches(candidate, envelope);
                return true;
              } catch {
                return false;
              }
            });

            // no match found
            if (matchIndex < 0) {
              return;
            }

            // remove the matching expected envelope
            expectedEnvelopes.splice(matchIndex, 1);
          } else {
            // in ordered mode we just look at the next expected envelope
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

          const stdio: ('inherit' | 'ipc' | 'ignore')[] = process.env.DEBUG
            ? ['inherit', 'inherit', 'inherit', 'ipc']
            : ['ignore', 'ignore', 'ignore', 'ipc'];

          child = spawn(
            'wrangler',
            [
              'dev',
              '--config',
              join(testPath, 'wrangler.jsonc'),
              '--show-interactive-dev-session',
              'false',
              '--var',
              `SENTRY_DSN:http://public@localhost:${mockServerPort}/1337`,
              '--var',
              `SERVER_URL:${serverUrl}`,
            ],
            { stdio, signal },
          );

          CLEANUP_STEPS.add(() => {
            child?.kill();
          });

          child.on('error', e => {
            // eslint-disable-next-line no-console
            console.error('Error starting child process:', e);
            reject(e);
          });

          child.on('message', (message: string) => {
            const msg = JSON.parse(message) as { event: string; port?: number };
            if (msg.event === 'DEV_SERVER_READY' && typeof msg.port === 'number') {
              setWorkerPort(msg.port);
              if (process.env.DEBUG) log('worker ready on port', msg.port);
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
          const url = `http://localhost:${await workerPortPromise}${path}`;
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
