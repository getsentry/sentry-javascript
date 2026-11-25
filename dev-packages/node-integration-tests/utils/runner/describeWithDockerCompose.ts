import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { join } from 'path';
import type { TestOptions } from 'vitest';
import { afterAll, beforeAll, describe } from 'vitest';

type DefineTests = () => void;

const SLOW_START_MS = 60_000;

// The pull time depends on the image registry, which this repo does not control. The slowest pull in CI took 237s.
const PULL_TIMEOUT_MS = 300_000;
const UP_TIMEOUT_MS = 120_000;
const UP_MAX_ATTEMPTS = 3;
const DOWN_TIMEOUT_MS = 60_000;
const LOGS_TIMEOUT_MS = 10_000;
const HOOK_MARGIN_MS = 5_000;

// `spawnSync` blocks the event loop, so a hook timeout cannot stop a phase. Each phase has its own
// enforced timeout, and the hook timeout is the worst case of all phases together: the hook can
// time out only when a phase did.
const START_TIMEOUT_MS =
  DOWN_TIMEOUT_MS + PULL_TIMEOUT_MS + UP_MAX_ATTEMPTS * (UP_TIMEOUT_MS + LOGS_TIMEOUT_MS + DOWN_TIMEOUT_MS);

interface DockerOptions {
  /**
   * The working directory to run docker compose in
   */
  workingDirectory: string[];
}

/**
 * Wraps a group of `createEsmAndCjsTests` (or `createCjsTests`/`createEsmTests`) calls that all
 * talk to the same Docker Compose service, bringing the container up **once** for the whole group
 * and tearing it down once at the end.
 *
 * Previously each test brought its own container up and down via `runner.withDockerCompose(...)`,
 * so a suite with N tests paid N × (`docker compose down` + `up --wait` healthcheck) — the
 * dominant cost of the Docker-backed suites. With this wrapper the container is started in a single
 * `beforeAll` and reused across every test in the group; the inner tests must NOT call
 * `withDockerCompose()` themselves.
 *
 * @example
 * describeWithDockerCompose('postgres', { workingDirectory: [__dirname] }, () => {
 *   createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
 *     test('...', async () => {
 *       await createRunner().expect({ transaction: EXPECTED }).start().completed();
 *     });
 *   });
 * });
 */
export function describeWithDockerCompose(
  name: string,
  dockerOptions: DockerOptions,
  options: TestOptions,
  defineTests: DefineTests,
): void;
export function describeWithDockerCompose(name: string, dockerOptions: DockerOptions, defineTests: DefineTests): void;
export function describeWithDockerCompose(
  name: string,
  dockerOptions: DockerOptions,
  defineTestsOrOptions: DefineTests | TestOptions,
  defineTests?: DefineTests,
): void {
  const options = typeof defineTestsOrOptions === 'function' ? { timeout: 120_000 } : defineTestsOrOptions;
  const callback = typeof defineTestsOrOptions === 'function' ? defineTestsOrOptions : defineTests!;

  describe(name, options, () => {
    let dockerDown: (() => void) | undefined;

    // Bring the container up once for the whole group.
    beforeAll(async () => {
      dockerDown = await runDockerCompose(dockerOptions);
    }, START_TIMEOUT_MS);

    afterAll(() => {
      dockerDown?.();
    }, DOWN_TIMEOUT_MS + HOOK_MARGIN_MS);

    callback();
  });
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

  // Docker Compose derives the project name from the compose file's directory
  // basename by default. Several suites live in directories that share a
  // basename (e.g. `tracing/mysql2` and `tracing/knex/mysql2`), so they collide
  // on the same project + network when running in parallel: one suite's
  // teardown removes the shared `<name>_default` network while a sibling is
  // still starting, producing "network <name>_default not found". Deriving a
  // unique, stable project name from the full working directory isolates every
  // suite from each other.
  const projectName = `sentry-it-${createHash('sha1').update(cwd).digest('hex').slice(0, 12)}`;
  const composeArgs = (...args: string[]): string[] => ['compose', '-p', projectName, ...args];

  const close = (): void => {
    spawnSync('docker', composeArgs('down', '--volumes'), {
      cwd,
      stdio: process.env.DEBUG ? 'inherit' : undefined,
      timeout: DOWN_TIMEOUT_MS,
    });
  };

  const output = (result: ReturnType<typeof spawnSync>): string =>
    `${result.stderr?.toString() ?? ''}${result.stdout?.toString() ?? ''}`;
  // Surface container logs to make healthcheck failures easier to diagnose in CI
  const containerLogs = (): string =>
    spawnSync('docker', composeArgs('logs'), { cwd, timeout: LOGS_TIMEOUT_MS }).stdout?.toString() ?? '';
  const timedOut = (result: ReturnType<typeof spawnSync>): boolean =>
    (result.error as { code?: string } | undefined)?.code === 'ETIMEDOUT';
  const upOutcome = (result: ReturnType<typeof spawnSync>): string =>
    timedOut(result) ? `timed out after ${UP_TIMEOUT_MS}ms` : `exit ${result.status}`;

  // ensure we're starting fresh
  close();

  // Pull on its own, so a slow image pull on a runner without cached images can be told apart from
  // a slow container start.
  const pullStartedAt = Date.now();
  const pull = spawnSync('docker', composeArgs('pull', '--policy', 'missing', '--quiet'), {
    cwd,
    stdio: process.env.DEBUG ? 'inherit' : 'pipe',
    timeout: PULL_TIMEOUT_MS,
  });
  const pullMs = Date.now() - pullStartedAt;
  if (timedOut(pull)) {
    // `up` would pull again inside its shorter timeout and hide which phase was slow.
    throw new Error(`docker compose pull timed out after ${PULL_TIMEOUT_MS}ms in ${cwd}\n${output(pull)}`);
  }
  if (pull.status !== 0) {
    // `up` pulls missing images too, so only report this
    // eslint-disable-next-line no-console
    console.warn(`[docker compose] pull failed after ${pullMs}ms (exit ${pull.status}) in ${cwd}\n${output(pull)}`);
  }

  const composeUp = (): ReturnType<typeof spawnSync> =>
    spawnSync('docker', composeArgs('up', '-d', '--wait'), {
      cwd,
      stdio: process.env.DEBUG ? 'inherit' : 'pipe',
      timeout: UP_TIMEOUT_MS,
    });

  // `docker compose up` occasionally fails on CI with transient daemon races
  // (e.g. "failed to set up container networking: network <x>_default not
  // found" right after the network was created). A clean teardown plus retry
  // clears these, while genuine healthcheck failures stay red on every attempt.
  const upStartedAt = Date.now();
  let attemptStartedAt = upStartedAt;
  let result = composeUp();
  for (let attempt = 1; attempt < UP_MAX_ATTEMPTS && result.status !== 0; attempt++) {
    // eslint-disable-next-line no-console
    console.warn(
      `[docker compose] up --wait attempt ${attempt} failed after ${Date.now() - attemptStartedAt}ms ` +
        `(${upOutcome(result)}) in ${cwd}\n${output(result)}\n--- container logs ---\n${containerLogs()}`,
    );
    close();
    attemptStartedAt = Date.now();
    result = composeUp();
  }
  const upMs = Date.now() - upStartedAt;

  if (result.status !== 0) {
    const logs = containerLogs();
    close();
    throw new Error(
      `docker compose up --wait failed (${upOutcome(result)}) in ${cwd}\n${output(result)}\n--- container logs ---\n${logs}`,
    );
  }

  if (pullMs + upMs > SLOW_START_MS) {
    // eslint-disable-next-line no-console
    console.warn(`[docker compose] slow start in ${cwd}: pull ${pullMs}ms, up --wait ${upMs}ms`);
  }

  return close;
}
