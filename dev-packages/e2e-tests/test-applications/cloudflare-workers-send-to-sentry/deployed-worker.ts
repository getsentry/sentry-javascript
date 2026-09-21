import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function wrangler(args: string[], env: Record<string, string> = {}): void {
  execFileSync('pnpm', ['exec', 'wrangler', ...args], {
    cwd: __dirname,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}

/**
 * Workflow names are unique per Cloudflare account, so every worker gets its own. The Vite build writes the
 * config wrangler deploys from, and `.wrangler/deploy/config.json` points to it.
 */
function nameWorkflowsAfterWorker(name: string): void {
  const redirect: { configPath: string } = JSON.parse(
    readFileSync(join(__dirname, '.wrangler/deploy/config.json'), 'utf8'),
  );
  const configPath = join(__dirname, '.wrangler/deploy', redirect.configPath);
  const config: { workflows?: { name: string }[] } = JSON.parse(readFileSync(configPath, 'utf8'));

  for (const workflow of config.workflows ?? []) {
    workflow.name = name;
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/** Deploys the worker under `name` and returns its workers.dev URL. */
export function deployWorker(name: string, dsn: string): string {
  nameWorkflowsAfterWorker(name);
  const outputDir = mkdtempSync(join(tmpdir(), 'wrangler-output-'));
  const outputFile = join(outputDir, 'output.ndjson');

  try {
    wrangler(['deploy', '--name', name, '--var', `E2E_TEST_DSN:${dsn}`], { WRANGLER_OUTPUT_FILE_PATH: outputFile });

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
    rmSync(outputDir, { recursive: true, force: true });
  }
}

export function deleteWorker(name: string): void {
  wrangler(['delete', '--name', name, '--force']);
}

/**
 * CI keeps its Workers: one per ref, overwritten by the next run of the same ref and deleted by the
 * cleanup workflow once a PR closes. Local runs delete theirs unless `E2E_KEEP_WORKER` is set.
 */
export function keepsWorker(): boolean {
  return Boolean(process.env.GITHUB_ACTIONS || process.env.E2E_KEEP_WORKER);
}

/** A freshly created workers.dev route can take a moment to become reachable. */
export async function waitForWorker(url: string): Promise<void> {
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

/**
 * Sends a request until the Worker itself answers it, and returns the body of that answer.
 *
 * On the first deployment of a Worker name, Cloudflare has answered a request with a 500 while
 * Workers Logs had no invocation for it. `status` is the status the Worker answers with. A Worker
 * that threw answers with status 500 and Cloudflare error code 1101, which sets it apart from a 500
 * that did not come from the Worker.
 */
export async function fetchFromWorker(url: string, status: number, init?: RequestInit): Promise<string> {
  const deadline = Date.now() + 60_000;
  let lastAnswer = 'no answer';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, init);
      const body = await response.text();
      // Cloudflare sends its error page as HTML to some clients (Node's fetch among them) and as
      // `error code: <code>` plain text to others, so the code is read from either format.
      const errorCode = /cf-error-code">(\d+)<|^error code: (\d+)$/.exec(body)?.slice(1).find(Boolean);

      if (response.status === status && (status !== 500 || errorCode === '1101')) {
        return body;
      }

      lastAnswer = `${response.status}, cf-ray ${response.headers.get('cf-ray')}, error code ${errorCode ?? 'none'}, body: ${body.slice(0, 200)}`;
    } catch (error) {
      lastAnswer = String(error);
    }

    console.log(`The Worker did not answer ${url}: ${lastAnswer}`);
    await new Promise(resolve => setTimeout(resolve, 2_000));
  }

  throw new Error(`The Worker did not answer ${url} with status ${status} within 60s. Last answer: ${lastAnswer}`);
}
