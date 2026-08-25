/**
 * Contract tests for `SentryCliAdapter` against the *real* Sentry CLI.
 *
 * Every other test in this package mocks the `sentry` module, so they assert which calls the
 * plugin makes but never that the CLI accepts them. That gap is not theoretical: the deploy name
 * used to be passed as `--name`, a flag the new CLI does not have, and the mocked tests were
 * green the whole time because the mock records whatever it is given.
 *
 * These tests therefore import the real CLI and point it at a mock Sentry HTTP server, so an
 * argument the CLI rejects fails here. They are deliberately few - the argv shapes, not the
 * plugin's option mapping, which the mocked tests already cover.
 *
 * They assert on the requests that reach the server rather than on the calls resolving. `run()`
 * resolves with `undefined` when the CLI rejects its arguments instead of throwing, so the
 * `--name` regression above produced no deploy, no error, and a successful build. Only the
 * absence of the request reveals it.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { startMockSentryServer } from '@sentry-internal/test-utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SentryCliAdapter } from '../../src/core/cli';
import type { NormalizedOptions } from '../../src/core/options-mapping';

const PORT = 3037;

let workDir: string;
let buildDir: string;
let server: ReturnType<typeof startMockSentryServer>;
let previousCwd: string;

interface RecordedRequest {
  method: string;
  url: string;
  jsonBody?: unknown;
}

function recordedRequestRecords(): RecordedRequest[] {
  const file = join(workDir, '.tmp_mock_uploads.json');
  if (!existsSync(file)) {
    return [];
  }
  return JSON.parse(readFileSync(file, 'utf-8')) as RecordedRequest[];
}

/** Paths of every request the mock server has recorded so far, in order. */
function recordedRequests(): string[] {
  return recordedRequestRecords().map(record => `${record.method} ${record.url}`);
}

/** Requests recorded since a marker returned by a previous `recordedRequests()` call. */
function requestsSince(before: string[]): string[] {
  return recordedRequests().slice(before.length);
}

function createAdapter(overrides: Partial<NormalizedOptions> = {}): SentryCliAdapter {
  return new SentryCliAdapter({
    authToken: 'fake-auth-token',
    org: 'test-org',
    project: 'test-project',
    url: `http://localhost:${PORT}`,
    release: {},
    ...overrides,
  } as NormalizedOptions);
}

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'sentry-cli-contract-'));
  buildDir = join(workDir, 'build');
  mkdirSync(buildDir);

  writeFileSync(join(buildDir, 'app.js'), 'console.log("hello");\n//# sourceMappingURL=app.js.map\n');
  writeFileSync(
    join(buildDir, 'app.js.map'),
    JSON.stringify({
      version: 3,
      file: 'app.js',
      sources: ['../src/app.ts'],
      sourcesContent: ['console.log("hello");'],
      names: [],
      mappings: 'AAAA',
    }),
  );

  // The CLI keeps config and a SQLite cache in `~/.sentry` unless told otherwise, so give it a
  // throwaway directory. Without this the suite reads and writes the developer's global CLI
  // state, which also makes it fail on a `cli.db` another CLI left in WAL mode.
  process.env['SENTRY_CONFIG_DIR'] = join(workDir, 'sentry-home');
  mkdirSync(process.env['SENTRY_CONFIG_DIR']);

  // The mock server writes its recording relative to cwd.
  previousCwd = process.cwd();
  process.chdir(workDir);

  server = startMockSentryServer({ port: PORT });
});

afterAll(() => {
  server.close();
  process.chdir(previousCwd);
  delete process.env['SENTRY_CONFIG_DIR'];
  rmSync(workDir, { recursive: true, force: true });
});

describe('SentryCliAdapter against the real CLI', () => {
  it('creates a release associated with the configured projects', async () => {
    const before = recordedRequestRecords();

    await createAdapter({ project: ['test-project', 'other-project'] }).createRelease('1.0.0');

    // Sentry rejects a release without projects (400), so the unscoped client must still send them.
    const createRequest = recordedRequestRecords()
      .slice(before.length)
      .find(record => record.method === 'POST' && record.url === '/api/0/organizations/test-org/releases/');
    expect(createRequest?.jsonBody).toEqual(
      expect.objectContaining({ version: '1.0.0', projects: ['test-project', 'other-project'] }),
    );
  });

  it('prefers the configured auth token over a stored CLI login', () => {
    delete process.env['SENTRY_FORCE_ENV_TOKEN'];

    createAdapter({ authToken: undefined });
    expect(process.env['SENTRY_FORCE_ENV_TOKEN']).toBeUndefined();

    createAdapter();
    expect(process.env['SENTRY_FORCE_ENV_TOKEN']).toBe('1');
  });

  it('exposes configured headers to the CLI through SENTRY_CUSTOM_HEADERS', () => {
    delete process.env['SENTRY_CUSTOM_HEADERS'];

    createAdapter({ headers: undefined });
    expect(process.env['SENTRY_CUSTOM_HEADERS']).toBeUndefined();

    createAdapter({ headers: { 'X-IAP-Token': 'abc', 'X-Forwarded-For': '10.0.0.1' } });
    expect(process.env['SENTRY_CUSTOM_HEADERS']).toBe('X-IAP-Token: abc; X-Forwarded-For: 10.0.0.1');

    delete process.env['SENTRY_CUSTOM_HEADERS'];
  });

  it('finalizes a release', async () => {
    const before = recordedRequests();

    await createAdapter().finalizeRelease('1.0.0');

    expect(requestsSince(before)).toContain('PUT /api/0/organizations/test-org/releases/1.0.0/');
  });

  it('sets commits from an explicit repo and sha', async () => {
    const before = recordedRequests();

    await createAdapter().setCommits('1.0.0', { repo: 'getsentry/sentry-javascript', commit: 'abc123' });

    expect(requestsSince(before)).toContain('PUT /api/0/organizations/test-org/releases/1.0.0/');
  });

  it('creates a deploy with an environment and a name', async () => {
    const before = recordedRequests();

    // The name is the third positional. As `--name` the CLI rejects the argv, `run()` resolves
    // with undefined anyway, and no deploy is created - so assert the request, not the promise.
    await createAdapter().newDeploy('1.0.0', {
      env: 'production',
      name: 'Deploy #42',
      url: 'https://example.com',
    });

    expect(requestsSince(before)).toContain('POST /api/0/organizations/test-org/releases/1.0.0/deploys/');
  });

  it('creates a deploy with duration-based timing', async () => {
    const before = recordedRequests();

    // `--time` cannot be combined with `--started`/`--finished`, so this covers the other branch.
    await createAdapter().newDeploy('1.0.0', { env: 'production', time: 900 });

    expect(requestsSince(before)).toContain('POST /api/0/organizations/test-org/releases/1.0.0/deploys/');
  });

  it('injects debug IDs into a build directory', async () => {
    await createAdapter().injectDebugIds([buildDir], undefined);

    // Injection is purely local, so the debug ID snippet in the bundle is the observable effect.
    expect(readFileSync(join(buildDir, 'app.js'), 'utf-8')).toContain('_sentryDebugIds');
  });

  it('uploads source maps with the full option set', async () => {
    const before = recordedRequests();

    await createAdapter().uploadSourcemaps('1.0.0', [
      {
        directory: buildDir,
        dist: 'dist-1',
        ext: ['js', 'map'],
        ignore: ['node_modules'],
        urlPrefix: '~/',
      },
    ]);

    expect(requestsSince(before)).toContain('POST /api/0/organizations/test-org/artifactbundle/assemble/');
  });

  it('resolves the server url, or gives up quietly', async () => {
    const adapter = createAdapter();

    // `info` exits non-zero when the token does not authenticate, and the adapter swallows that
    // and returns undefined - which turns telemetry off rather than on. Both outcomes are fine;
    // what must not happen is the call throwing.
    const url = await adapter.getServerUrl();
    expect(url === undefined || url === `http://localhost:${PORT}`).toBe(true);
  });
});
