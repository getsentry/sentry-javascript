import type { Envelope, EnvelopeItemType } from '@sentry/core';
import { normalize } from '@sentry/core';
import { createBasicSentryServer } from '@sentry-internal/test-utils';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { inspect } from 'util';
import { expect } from 'vitest';

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

  if (!existsSync(testPath)) {
    throw new Error(`Test scenario not found: ${testPath}`);
  }

  const cleanupSteps = new Set<VoidFunction>();
  const expectedEnvelopes: Expected[] = [];
  // By default, we ignore session & sessions
  const ignored: Set<EnvelopeItemType> = new Set(['session', 'sessions', 'client_report']);

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
    start: function (): StartResult {
      let isComplete = false;
      let completeError: Error | undefined;

      const expectedEnvelopeCount = expectedEnvelopes.length;

      let envelopeCount = 0;
      let scenarioServerPort: number | undefined;
      let child: ReturnType<typeof spawn> | undefined;

      function complete(error?: Error): void {
        if (isComplete) {
          return;
        }

        isComplete = true;
        completeError = error || undefined;
        for (const step of cleanupSteps) {
          step();
        }
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

        const envelopeItemType = envelope[1][0][0].type;

        if (ignored.has(envelopeItemType)) {
          return;
        }

        const expected = expectedEnvelopes.shift();

        // Catch any error or failed assertions and pass them to done to end the test quickly
        try {
          if (!expected) {
            return;
          }

          if (typeof expected === 'function') {
            expected(envelope);
          } else {
            expect(envelope).toEqual(expected);
          }
          expectCallbackCalled();
        } catch (e) {
          complete(e as Error);
        }
      }

      createBasicSentryServer(newEnvelope)
        .then(([mockServerPort, mockServerClose]) => {
          if (mockServerClose) {
            cleanupSteps.add(() => {
              mockServerClose();
            });
          }

          // const env = { ...process.env, ...withEnv, SENTRY_DSN: `http://public@localhost:${mockServerPort}/1337` };

          const SENTRY_DSN = `http://public@localhost:${mockServerPort}/1337`;

          if (process.env.DEBUG) log('starting scenario', { testPath, SENTRY_DSN });

          const wranglerConfigPath = join(testPath, 'wrangler.jsonc');

          child = spawn('wrangler', ['dev', '--config', wranglerConfigPath, '--var', `SENTRY_DSN:${SENTRY_DSN}`]);

          child.on('error', e => {
            // eslint-disable-next-line no-console
            console.error('Error starting child process:', e);
            complete(e);
          });

          cleanupSteps.add(() => {
            child?.kill();
          });

          if (process.env.DEBUG) {
            child.stderr?.on('data', (data: Buffer) => {
              log('stderr line', data.toString());
            });
          }

          child.stdout?.on('data', (data: Buffer) => {
            if (scenarioServerPort === undefined) {
              const line = data.toString();
              const result = line.match(/Ready on http:\/\/localhost:(\d+)/);
              if (result?.[1]) {
                scenarioServerPort = parseInt(result[1], 10);
              }
            }

            if (process.env.DEBUG) {
              log('stdout line', data.toString());
            }
          });

          // Pass error to done to end the test quickly
          child.on('error', e => {
            if (process.env.DEBUG) log('scenario error', e);
            complete(e);
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
