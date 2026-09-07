import type { Envelope, EnvelopeItemType, SerializedStreamedSpan } from '@sentry/core';
import { normalize } from '@sentry/core';
import { createBasicSentryServer } from '@sentry-internal/test-utils';
import { spawn, spawnSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { inspect } from 'util';
import { expect, onTestFinished } from 'vitest';
import { getSpansFromEnvelope } from './spanUtils';

const CLEANUP_STEPS = new Set<() => void>();

export function cleanupChildProcesses(): void {
  for (const step of CLEANUP_STEPS) {
    step();
  }
  CLEANUP_STEPS.clear();
}

process.on('exit', cleanupChildProcesses);

/**
 * Resolve the wrangler config `wrangler dev` should serve for a worker.
 *
 * Most suites run straight from source (`wrangler dev --config <name>.jsonc`).
 * A suite that opts into the Sentry Vite plugin instead ships a `vite.config.*`
 * (and no top-level `main` in its wrangler config): for those we run `vite build`
 * first — so the plugin's build-time auto-instrumentation transform runs — and
 * point wrangler at the generated config under `dist/<worker>/wrangler.json`.
 *
 * `wranglerConfigName` selects which source config the Vite build corresponds to
 * (`wrangler.jsonc` for the main worker, `wrangler-sub-worker.jsonc` for a sub),
 * so a Vite suite's generated output is matched to the right worker.
 */
function resolveWorkerConfig(testPath: string, wranglerConfigName: string): string {
  const sourceConfig = join(testPath, wranglerConfigName);
  const viteConfig = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs']
    .map(name => join(testPath, name))
    .find(existsSync);

  // No Vite config → serve the source wrangler config unchanged (existing path).
  if (!viteConfig) {
    return sourceConfig;
  }

  const result = spawnSync('vite', ['build'], { cwd: testPath, stdio: process.env.DEBUG ? 'inherit' : 'ignore' });
  if (result.status !== 0) {
    throw new Error(`vite build failed for ${testPath} (exit code ${result.status})`);
  }

  // `@cloudflare/vite-plugin` emits one directory per worker under `dist/`, each
  // containing a resolved `wrangler.json`. Match the one whose original config is
  // this worker's source config so multi-worker suites map correctly.
  const distDir = join(testPath, 'dist');
  const builtConfig = readdirSync(distDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => join(distDir, entry.name, 'wrangler.json'))
    .find(configPath => existsSync(configPath) && builtFromSource(configPath, sourceConfig));

  if (!builtConfig) {
    throw new Error(`Could not locate a Vite-built wrangler config for ${sourceConfig} under ${distDir}`);
  }
  return builtConfig;
}

/** Whether a generated `wrangler.json` was built from the given source config. */
function builtFromSource(builtConfigPath: string, sourceConfigPath: string): boolean {
  try {
    const built = JSON.parse(readFileSync(builtConfigPath, 'utf8')) as { userConfigPath?: string; configPath?: string };
    return built.userConfigPath === sourceConfigPath || built.configPath === sourceConfigPath;
  } catch {
    return false;
  }
}

type RetryOptions = { maxRetries?: number; retryDelayMs?: number };

// Wrangler can report "Ready" before it can actually handle requests.
// This retries fetch on connection errors and transient 500 responses to handle this race condition.
// The budget (maxRetries * retryDelayMs) must cover the "ready-but-not-serving" window, which can be
// several seconds on a loaded CI runner — hence a generous default.
//
// Requests expected to fail must disable retries (`maxRetries: 1`), because their 500 or connection
// reset is indistinguishable from a transient startup failure and retrying only repeats the exception.
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  { maxRetries = 25, retryDelayMs = 200 }: RetryOptions = {},
): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, init);

      if (res.status === 500 && attempt < maxRetries - 1) {
        if (process.env.DEBUG) log(`Got 500, retrying (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, retryDelayMs));
        continue;
      }

      return res;
    } catch (e) {
      const isConnectionError =
        e instanceof Error && (e.message.includes('ECONNREFUSED') || e.message.includes('fetch failed'));

      if (isConnectionError && attempt < maxRetries - 1) {
        if (process.env.DEBUG) log(`Request failed, retrying (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, retryDelayMs));
        continue;
      }

      throw e;
    }
  }

  throw new Error('fetchWithRetry: unreachable');
}

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

/** Either the name of the segment span, or a predicate over it. */
type SegmentMatcher = string | ((segmentSpan: SerializedStreamedSpan) => boolean);

type StartResult = {
  completed(): Promise<void>;
  makeRequest<T>(
    method: 'get' | 'post',
    path: string,
    options?: { headers?: Record<string, string>; data?: BodyInit; expectError?: boolean },
  ): Promise<T | undefined>;
  makeRequestAndWaitForEnvelope<T>(
    method: 'get' | 'post',
    path: string,
    expected: Expected | Expected[],
    options?: { headers?: Record<string, string>; data?: BodyInit; expectError?: boolean },
  ): Promise<T | undefined>;
  /**
   * Accumulates spans across envelopes, grouped by trace, and resolves with the spans of the first
   * trace that satisfies `isDone`.
   *
   * A trace reaches the mock server in more than one envelope: the span buffer flushes on a timer, so
   * a segment that is still open when its children flush arrives separately, and a Durable Object or a
   * service binding sends its own spans from its own isolate. Anything asserting on a whole trace has
   * to accumulate rather than read a single envelope.
   */
  collectStreamedSpans(isDone: (spansOfTrace: SerializedStreamedSpan[]) => boolean): Promise<SerializedStreamedSpan[]>;
  /**
   * Accumulates the spans of a trace until its segment span has arrived.
   *
   * Only use this to assert on the segment span itself. The segment span ends last, but each
   * envelope is its own request to the mock server, so the segment can still be *received* before
   * the envelope carrying its children. A suite that asserts on the children has to wait for those
   * children by name or by count through `collectStreamedSpans`.
   */
  collectStreamedSpansUntilSegment(segment: SegmentMatcher): Promise<SerializedStreamedSpan[]>;
};

/** Creates a test runner */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createRunner(...paths: string[]) {
  const testPath = join(...paths);

  // controls whether envelopes are expected in predefined order or not
  let unordered = false;
  let failOnUnexpected = false;

  if (!existsSync(testPath)) {
    throw new Error(`Test scenario not found: ${testPath}`);
  }

  const expectedEnvelopes: Expected[] = [];
  // By default, we ignore session & sessions
  const ignored: Set<EnvelopeItemType> = new Set(['session', 'sessions', 'client_report']);
  let serverUrl: string | undefined;
  const extraWranglerArgs: string[] = [];

  return {
    withServerUrl: function (url: string) {
      serverUrl = url;
      return this;
    },
    withWranglerArgs: function (...args: string[]) {
      extraWranglerArgs.push(...args);
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
    failOnUnexpected: function () {
      failOnUnexpected = true;
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
      let child: ReturnType<typeof spawn> | undefined;
      let childSubWorker: ReturnType<typeof spawn> | undefined;

      // Tears down this runner only. `cleanupChildProcesses` tears down every registered runner, so
      // running it here would kill a worker another test has already started: a runner whose
      // `isComplete` settles after its own test (a suite that asserts on streamed spans never calls
      // `completed()`, so the abort signal settles it) would take the next test's worker with it.
      // The mock server has to close here as well, otherwise one server per scenario stays listening
      // for the whole run.
      function cleanupThisRunner(): void {
        child?.kill();
        childSubWorker?.kill();
        closeMockServer?.();
        closeMockServer = undefined;
      }

      // A suite that asserts on streamed spans never calls `completed()`, so `isComplete` never
      // settles and its worker would stay alive until the vitest process exits. With one such suite
      // per file, a full run ends up with dozens of `wrangler dev` processes competing for the
      // machine, and the later suites time out. Tie the teardown to the test instead.
      onTestFinished(cleanupThisRunner);

      let closeMockServer: (() => void) | undefined;

      const { resolve, reject, promise: isComplete } = deferredPromise(cleanupThisRunner);

      const spanWaiters: {
        onSpans: (spans: SerializedStreamedSpan[]) => boolean;
        resolve: () => void;
        reject: (e: unknown) => void;
      }[] = [];
      let failure: unknown;

      // `reject` is called from background event handlers (child process `error`/`exit`, mock server
      // callbacks) that fire at arbitrary times relative to the test's `await` points. If `reject` runs
      // while nothing is awaiting `isComplete` yet (e.g. a child transiently exits while the test is
      // parked in `makeRequest`), the rejection has no handler attached and surfaces as an unhandled
      // promise rejection — which Vitest reports as a spurious "Unhandled error" that fails the whole
      // suite. Attaching a catch keeps the promise "handled"; the real rejection is still delivered
      // to callers via `completed()`, so genuine failures still fail the test.
      //
      // A test that only asserts on streamed spans never calls `completed()`, so the same rejection is
      // handed to the span waiters as well. Without it, a worker that fails to boot would surface as a
      // Vitest timeout instead of the actual error.
      isComplete.catch(e => {
        failure = e;
        for (const waiter of spanWaiters.splice(0)) {
          waiter.reject(e);
        }
      });

      const expectedEnvelopeCount = expectedEnvelopes.length;

      let envelopeCount = 0;
      let unexpectedEnvelopeError: Error | undefined;
      const envelopeWaiters: { expected: Expected; resolve: () => void; reject: (e: unknown) => void }[] = [];
      const {
        resolve: setWorkerPort,
        reject: rejectWorkerPort,
        promise: workerPortPromise,
      } = deferredPromise<number>();
      workerPortPromise.catch(() => {
        // handled in `makeRequest`
      });

      /** Called after each expect callback to check if we're complete */
      function expectCallbackCalled(): void {
        envelopeCount++;
        if (envelopeCount === expectedEnvelopeCount) {
          resolve();
        }
      }

      function waitForEnvelope(expected: Expected): Promise<void> {
        return new Promise((resolveWaiter, rejectWaiter) => {
          envelopeWaiters.push({ expected, resolve: resolveWaiter, reject: rejectWaiter });
        });
      }

      /** Resolves once `onSpans` returns true for the spans of an arriving span envelope. */
      function waitForSpans(onSpans: (spans: SerializedStreamedSpan[]) => boolean): Promise<void> {
        return new Promise((resolveWaiter, rejectWaiter) => {
          if (failure) {
            rejectWaiter(failure);
            return;
          }
          spanWaiters.push({ onSpans, resolve: resolveWaiter, reject: rejectWaiter });
        });
      }

      /**
       * Span waiters observe the envelope stream, they never consume from it: a suite can assert on
       * streamed spans and on error envelopes at the same time.
       */
      function notifySpanWaiters(envelope: Envelope): void {
        const spans = getSpansFromEnvelope(envelope);
        if (!spans.length) {
          return;
        }

        for (const waiter of spanWaiters.slice()) {
          let done: boolean;
          try {
            done = waiter.onSpans(spans);
          } catch (e) {
            spanWaiters.splice(spanWaiters.indexOf(waiter), 1);
            waiter.reject(e);
            continue;
          }

          if (done) {
            spanWaiters.splice(spanWaiters.indexOf(waiter), 1);
            waiter.resolve();
          }
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

        notifySpanWaiters(envelope);

        const envelopeItemType = envelope[1][0][0].type;

        if (ignored.has(envelopeItemType)) {
          return;
        }

        // Resolve per-request waiters first, matching in any order so a request
        // expecting multiple envelopes isn't sensitive to their arrival order.
        if (envelopeWaiters.length > 0) {
          const waiterIndex = envelopeWaiters.findIndex(waiter => {
            try {
              assertEnvelopeMatches(waiter.expected, envelope);
              return true;
            } catch {
              return false;
            }
          });

          if (waiterIndex >= 0) {
            envelopeWaiters.splice(waiterIndex, 1)[0]!.resolve();
            return;
          }
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
              if (failOnUnexpected) {
                unexpectedEnvelopeError ??= new Error('Received an unexpected envelope');
                reject(unexpectedEnvelopeError);
              }
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
        .then(async ([mockServerPort, mockServerClose]) => {
          if (mockServerClose) {
            closeMockServer = mockServerClose;
            CLEANUP_STEPS.add(() => {
              mockServerClose();
            });
          }

          if (process.env.DEBUG) log('Starting scenario', testPath);

          const onChildError = (e: Error) => {
            // eslint-disable-next-line no-console
            console.error('Error starting child process:', e);
            reject(e);
          };

          // Inspired by workers-sdk: https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/e2e/helpers/wrangler.ts
          function waitForReady(childProcess: ReturnType<typeof spawn>): Promise<number> {
            return new Promise((resolve, reject) => {
              const stdout = childProcess.stdout;
              if (!stdout) {
                reject(new Error('No stdout available'));
                return;
              }

              let output = '';
              stdout.on('data', (chunk: Buffer) => {
                const text = chunk.toString();
                if (process.env.DEBUG) process.stdout.write(text);
                output += text;

                const match = output.match(/Ready on (https?:\/\/[^\s]+)/);
                if (match?.[1]) {
                  resolve(parseInt(new URL(match[1]).port, 10));
                }
              });

              childProcess.on('close', (code, sig) => {
                reject(new Error(`wrangler exited with code ${code} (signal ${sig}) before becoming ready`));
              });
            });
          }

          if (existsSync(join(testPath, 'wrangler-sub-worker.jsonc'))) {
            childSubWorker = spawn(
              'wrangler',
              [
                'dev',
                '--config',
                resolveWorkerConfig(testPath, 'wrangler-sub-worker.jsonc'),
                '--show-interactive-dev-session',
                'false',
                '--var',
                `SENTRY_DSN:http://public@localhost:${mockServerPort}/1337`,
                '--port',
                '0',
                '--inspector-port',
                '0',
              ],
              { stdio: ['ignore', 'pipe', 'inherit'], signal },
            );

            childSubWorker.on('error', onChildError);
            childSubWorker.on('exit', code => {
              onChildError(new Error(`Sub-worker exited with code ${code}`));
            });

            await waitForReady(childSubWorker);
          }

          child = spawn(
            'wrangler',
            [
              'dev',
              '--config',
              resolveWorkerConfig(testPath, 'wrangler.jsonc'),
              '--show-interactive-dev-session',
              'false',
              '--var',
              `SENTRY_DSN:http://public@localhost:${mockServerPort}/1337`,
              '--var',
              `SERVER_URL:${serverUrl}`,
              '--port',
              '0',
              '--inspector-port',
              '0',
              ...extraWranglerArgs,
            ],
            { stdio: ['ignore', 'pipe', 'inherit'], signal },
          );

          CLEANUP_STEPS.add(() => {
            child?.kill();
            childSubWorker?.kill();
          });

          childSubWorker?.on('error', onChildError);
          child.on('error', onChildError);

          const workerPort = await waitForReady(child);

          setWorkerPort(workerPort);
        })
        .catch(e => {
          rejectWorkerPort(e);
          reject(e);
        });

      return {
        completed: async function (): Promise<void> {
          await isComplete;
          if (unexpectedEnvelopeError) {
            throw unexpectedEnvelopeError;
          }
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
            const res = await fetchWithRetry(url, { headers, method, body }, expectError ? { maxRetries: 1 } : {});

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
        makeRequestAndWaitForEnvelope: async function <T>(
          method: 'get' | 'post',
          path: string,
          expected: Expected | Expected[],
          options: { headers?: Record<string, string>; data?: BodyInit; expectError?: boolean } = {},
        ): Promise<T | undefined> {
          // `Expected` includes `Envelope`, which is itself an array, so `Array.isArray` can't
          // distinguish a single `Envelope` from an `Expected[]`. Callers pass expectation
          // callbacks (or an array of them), so the narrowed value is always `Expected[]`.
          const expectations = (Array.isArray(expected) ? expected : [expected]) as Expected[];
          const envelopePromises = expectations.map(e => waitForEnvelope(e));
          const result = await this.makeRequest<T>(method, path, options);
          await Promise.all(envelopePromises);
          return result;
        },
        collectStreamedSpans: async function (
          isDone: (spansOfTrace: SerializedStreamedSpan[]) => boolean,
        ): Promise<SerializedStreamedSpan[]> {
          const spansByTrace = new Map<string, SerializedStreamedSpan[]>();
          let matched: SerializedStreamedSpan[] = [];

          await waitForSpans(spans => {
            for (const span of spans) {
              const spansOfTrace = spansByTrace.get(span.trace_id);
              if (spansOfTrace) {
                spansOfTrace.push(span);
              } else {
                spansByTrace.set(span.trace_id, [span]);
              }
            }

            // Every trace is a candidate, so a trace that never satisfies `isDone` cannot hold up the
            // one that does. Insertion order means the earliest-arriving trace wins a tie.
            for (const spansOfTrace of spansByTrace.values()) {
              if (isDone(spansOfTrace)) {
                matched = spansOfTrace;
                return true;
              }
            }

            return false;
          });

          return matched;
        },
        collectStreamedSpansUntilSegment: function (segment: SegmentMatcher): Promise<SerializedStreamedSpan[]> {
          const matchesSegment =
            typeof segment === 'string' ? (span: SerializedStreamedSpan) => span.name === segment : segment;

          return this.collectStreamedSpans(spansOfTrace =>
            spansOfTrace.some(span => span.is_segment && matchesSegment(span)),
          );
        },
      };
    },
  };
}

function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(...args.map(arg => normalize(arg)));
}
