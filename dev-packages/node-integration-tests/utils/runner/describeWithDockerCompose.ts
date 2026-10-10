import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { join } from 'path';
import type { TestOptions } from 'vitest';
import { afterAll, beforeAll, describe } from 'vitest';

type DefineTests = () => void;

const SLOW_START_MS = 60_000;

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

    // Bring the container up once for the whole group. The generous timeout covers image pulls and
    // slow healthchecks on the first run. On a runner without cached images, pulling the ~1.5 GB
    // mssql image and starting SQL Server took longer than 120s.
    beforeAll(async () => {
      dockerDown = await runDockerCompose(dockerOptions);
    }, 300_000);

    afterAll(() => {
      dockerDown?.();
    }, 60_000);

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
    });
  };

  const output = (result: ReturnType<typeof spawnSync>): string =>
    `${result.stderr?.toString() ?? ''}${result.stdout?.toString() ?? ''}`;
  // Surface container logs to make healthcheck failures easier to diagnose in CI
  const containerLogs = (): string => spawnSync('docker', composeArgs('logs'), { cwd }).stdout?.toString() ?? '';

  // ensure we're starting fresh
  close();

  // Pull on its own, so a slow image pull on a runner without cached images can be told apart from
  // a slow container start.
  const pullStartedAt = Date.now();
  const pull = spawnSync('docker', composeArgs('pull', '--policy', 'missing', '--quiet'), {
    cwd,
    stdio: process.env.DEBUG ? 'inherit' : 'pipe',
  });
  const pullMs = Date.now() - pullStartedAt;
  if (pull.status !== 0) {
    // `up` pulls missing images too, so only report this
    // eslint-disable-next-line no-console
    console.warn(`[docker compose] pull failed after ${pullMs}ms (exit ${pull.status}) in ${cwd}\n${output(pull)}`);
  }

  const composeUp = (): ReturnType<typeof spawnSync> =>
    spawnSync('docker', composeArgs('up', '-d', '--wait'), {
      cwd,
      stdio: process.env.DEBUG ? 'inherit' : 'pipe',
    });

  // `docker compose up` occasionally fails on CI with transient daemon races
  // (e.g. "failed to set up container networking: network <x>_default not
  // found" right after the network was created). A clean teardown plus retry
  // clears these, while genuine healthcheck failures stay red on every attempt.
  const maxAttempts = 3;
  const upStartedAt = Date.now();
  let attemptStartedAt = upStartedAt;
  let result = composeUp();
  for (let attempt = 1; attempt < maxAttempts && result.status !== 0; attempt++) {
    // eslint-disable-next-line no-console
    console.warn(
      `[docker compose] up --wait attempt ${attempt} failed after ${Date.now() - attemptStartedAt}ms ` +
        `(exit ${result.status}) in ${cwd}\n${output(result)}\n--- container logs ---\n${containerLogs()}`,
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
      `docker compose up --wait failed (exit ${result.status})\n${output(result)}\n--- container logs ---\n${logs}`,
    );
  }

  if (pullMs + upMs > SLOW_START_MS) {
    // eslint-disable-next-line no-console
    console.warn(`[docker compose] slow start in ${cwd}: pull ${pullMs}ms, up --wait ${upMs}ms`);
  }

  return close;
}
