import type { TestOptions } from 'vitest';
import { afterAll, beforeAll, describe } from 'vitest';
import { type DockerOptions, runDockerCompose } from './createRunner';

type DefineTests = () => void;

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
    // slow healthchecks on the first run.
    beforeAll(async () => {
      dockerDown = await runDockerCompose(dockerOptions);
    }, 120_000);

    afterAll(() => {
      dockerDown?.();
    }, 60_000);

    callback();
  });
}
