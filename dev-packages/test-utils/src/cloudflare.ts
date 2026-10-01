import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { FullConfig } from '@playwright/test';

export interface WorkerGlobalSetupOptions {
  /**
   * The start of the Worker name. The `cleanup-e2e-workers` workflow deletes `<workerPrefix>-pr-<number>`
   * once a PR closes, so every prefix must also be listed there.
   */
  workerPrefix: string;
  /**
   * The secrets of the Worker besides `E2E_TEST_DSN` and `E2E_TEST_WORKER_TOKEN`, as a map from the
   * binding name to the name of the environment variable that holds the value.
   */
  secrets?: Record<string, string>;
}

function wrangler(appDir: string, args: string[], env: Record<string, string> = {}): void {
  execFileSync('pnpm', ['exec', 'wrangler', ...args], {
    cwd: appDir,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}

/**
 * In CI the name follows the ref, so `develop`, `master` and every PR get a stable Worker that the
 * next run of the same ref overwrites. Pull request refs look like `123/merge` and merge queue refs
 * like `gh-readonly-queue/<base>/pr-123-<sha>`; both map to the PR's Worker.
 */
function getWorkerName(workerPrefix: string): string {
  if (!process.env.GITHUB_ACTIONS) {
    return `${workerPrefix}-local-${randomBytes(3).toString('hex')}`;
  }

  const { GITHUB_EVENT_NAME, GITHUB_REF_NAME = '' } = process.env;
  const prNumber =
    GITHUB_EVENT_NAME === 'pull_request' ? GITHUB_REF_NAME.split('/')[0] : /\/pr-(\d+)-/.exec(GITHUB_REF_NAME)?.[1];
  const ref = prNumber ? `pr-${prNumber}` : GITHUB_REF_NAME;
  // Worker names allow lowercase alphanumerics and dashes only, up to 63 characters.
  const slug = ref.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return `${workerPrefix}-${slug}`.slice(0, 63).replace(/-+$/, '');
}

/**
 * Workflow names are unique per Cloudflare account, so every worker gets its own. The Vite build writes the
 * config wrangler deploys from, and `.wrangler/deploy/config.json` points to it.
 */
function nameWorkflowsAfterWorker(appDir: string, name: string): void {
  const redirect: { configPath: string } = JSON.parse(
    readFileSync(join(appDir, '.wrangler/deploy/config.json'), 'utf8'),
  );
  const configPath = join(appDir, '.wrangler/deploy', redirect.configPath);
  const config: { workflows?: { name: string }[] } = JSON.parse(readFileSync(configPath, 'utf8'));

  for (const workflow of config.workflows ?? []) {
    workflow.name = name;
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Deploys the worker under `name` and returns its workers.dev URL. The values go up as secrets, so
 * wrangler does not print them the way it prints plain-text vars.
 */
function deployWorker(appDir: string, name: string, secrets: Record<string, string>): string {
  nameWorkflowsAfterWorker(appDir, name);
  const tempDir = mkdtempSync(join(tmpdir(), 'wrangler-deploy-'));
  const outputFile = join(tempDir, 'output.ndjson');
  const secretsFile = join(tempDir, 'secrets.json');

  try {
    writeFileSync(secretsFile, JSON.stringify(secrets), { mode: 0o600 });
    wrangler(appDir, ['deploy', '--name', name, '--secrets-file', secretsFile], {
      WRANGLER_OUTPUT_FILE_PATH: outputFile,
    });

    const url = readFileSync(outputFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as { type?: string; targets?: string[] })
      .find(entry => entry.type === 'deploy')
      ?.targets?.find(target => target.endsWith('.workers.dev'));

    if (!url) {
      throw new Error(`Could not find the workers.dev URL in the wrangler deploy output for ${name}.`);
    }

    return url;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function deleteWorker(appDir: string, name: string): void {
  wrangler(appDir, ['delete', '--name', name, '--force']);
}

/**
 * CI keeps its Workers: one per ref, overwritten by the next run of the same ref and deleted by the
 * cleanup workflow once a PR closes. Local runs delete theirs unless `E2E_KEEP_WORKER` is set.
 */
function keepsWorker(): boolean {
  return Boolean(process.env.GITHUB_ACTIONS || process.env.E2E_KEEP_WORKER);
}

/** A freshly created workers.dev route can take a moment to become reachable. */
async function waitForWorker(url: string): Promise<void> {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    try {
      // The SDK does not trace HEAD requests, so the probe leaves no spans behind in Sentry.
      const response = await fetch(url, { method: 'HEAD' });

      if (response.ok) {
        return;
      }
    } catch {
      // DNS for the new subdomain may not have propagated yet.
    }

    await new Promise(resolve => setTimeout(resolve, 2_000));
  }

  throw new Error(`Worker at ${url} did not become reachable within 60s.`);
}

/** The directory of the test app, where wrangler finds the build output to deploy. */
function getAppDir(config: FullConfig): string {
  return config.configFile ? dirname(config.configFile) : process.cwd();
}

/**
 * Returns a Playwright global setup that deploys the built test app as a real Worker. The tests read
 * its URL from `E2E_TEST_WORKER_URL`, and {@link workerGlobalTeardown} deletes it again.
 *
 * The Worker also gets the secret `E2E_TEST_WORKER_TOKEN`, a random value that is new for every deploy
 * and that {@link fetchFromWorker} sends as `Authorization: Bearer <token>`. CI keeps its Workers after
 * the run, so a Worker that can spend money (for example with an LLM API key) must reject requests
 * without this token.
 */
export function createWorkerGlobalSetup(options: WorkerGlobalSetupOptions): (config: FullConfig) => Promise<void> {
  return async config => {
    const appDir = getAppDir(config);

    if (!existsSync(join(appDir, '.wrangler/deploy/config.json'))) {
      throw new Error('Run `pnpm build` first: wrangler would deploy the uninstrumented source.');
    }

    // Wrangler authenticates with `CLOUDFLARE_API_TOKEN` (CI) or a `wrangler login` session (local),
    // but it cannot pick an account on its own outside of a terminal.
    if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
      throw new Error('CLOUDFLARE_ACCOUNT_ID must be set to deploy the test worker.');
    }

    process.env.E2E_TEST_WORKER_TOKEN = randomBytes(32).toString('hex');

    const secrets: Record<string, string> = {};
    for (const [binding, envName] of Object.entries({
      E2E_TEST_DSN: 'E2E_TEST_DSN',
      E2E_TEST_WORKER_TOKEN: 'E2E_TEST_WORKER_TOKEN',
      ...options.secrets,
    })) {
      const value = process.env[envName];
      if (!value) {
        throw new Error(`${envName} must be set to deploy the test worker.`);
      }
      secrets[binding] = value;
    }

    const workerName = getWorkerName(options.workerPrefix);
    const workerUrl = deployWorker(appDir, workerName, secrets);
    process.env.E2E_TEST_WORKER_NAME = workerName;

    try {
      await waitForWorker(workerUrl);
    } catch (error) {
      if (!keepsWorker()) {
        try {
          deleteWorker(appDir, workerName);
        } catch (deleteError) {
          // The unreachable worker is the failure to report, not the cleanup.
          // eslint-disable-next-line no-console
          console.error(`Failed to delete worker ${workerName}:`, deleteError);
        }
      }
      throw error;
    }

    process.env.E2E_TEST_WORKER_URL = workerUrl;
  };
}

/** Playwright global teardown that deletes the Worker {@link createWorkerGlobalSetup} deployed. */
export function workerGlobalTeardown(config: FullConfig): void {
  const workerName = process.env.E2E_TEST_WORKER_NAME;

  if (!workerName) {
    return;
  }

  if (keepsWorker()) {
    // eslint-disable-next-line no-console
    console.log(`Keeping worker ${workerName} at ${process.env.E2E_TEST_WORKER_URL}`);
    return;
  }

  try {
    deleteWorker(getAppDir(config), workerName);
  } catch (error) {
    // A leaked worker is not an SDK failure, so it must not fail a run whose tests passed.
    // eslint-disable-next-line no-console
    console.error(
      `Failed to delete worker ${workerName}, delete it with \`wrangler delete --name ${workerName}\`:`,
      error,
    );
  }
}

/**
 * Sends a request until the Worker itself answers it, and returns the body of that answer.
 *
 * On the first deployment of a Worker name, Cloudflare has answered a request with a 500 while
 * Workers Logs had no invocation for it. `status` is the status the Worker answers with. A Worker
 * that threw answers with status 500 and Cloudflare error code 1101, which sets it apart from a 500
 * that did not come from the Worker.
 *
 * The request carries the `E2E_TEST_WORKER_TOKEN` of {@link createWorkerGlobalSetup}, unless `init`
 * sets its own `Authorization` header.
 */
export async function fetchFromWorker(url: string, status: number, init?: RequestInit): Promise<string> {
  const deadline = Date.now() + 60_000;
  let lastAnswer = 'no answer';
  const headers = new Headers(init?.headers);
  if (process.env.E2E_TEST_WORKER_TOKEN && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${process.env.E2E_TEST_WORKER_TOKEN}`);
  }

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { ...init, headers });
      const body = await response.text();
      // Cloudflare sends its error page as HTML to some clients (Node's fetch among them) and as
      // `error code: <code>` plain text to others, so the code is read from either format.
      const errorCode = /cf-error-code">(\d+)<|^error code: (\d+)/.exec(body)?.slice(1).find(Boolean);

      if (response.status === status && (status !== 500 || errorCode === '1101')) {
        return body;
      }

      lastAnswer = `${response.status}, cf-ray ${response.headers.get('cf-ray')}, error code ${errorCode ?? 'none'}, body: ${body.slice(0, 200)}`;
    } catch (error) {
      lastAnswer = String(error);
    }

    // eslint-disable-next-line no-console
    console.log(`The Worker did not answer ${url}: ${lastAnswer}`);
    await new Promise(resolve => setTimeout(resolve, 2_000));
  }

  throw new Error(`The Worker did not answer ${url} with status ${status} within 60s. Last answer: ${lastAnswer}`);
}
