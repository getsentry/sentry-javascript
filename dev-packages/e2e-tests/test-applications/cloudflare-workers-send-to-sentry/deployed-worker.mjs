import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function wrangler(args, env = {}) {
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
function nameWorkflowsAfterWorker(name) {
  const redirect = JSON.parse(readFileSync(join(__dirname, '.wrangler/deploy/config.json'), 'utf8'));
  const configPath = join(__dirname, '.wrangler/deploy', redirect.configPath);
  const config = JSON.parse(readFileSync(configPath, 'utf8'));

  for (const workflow of config.workflows ?? []) {
    workflow.name = name;
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/** Deploys the worker under `name` and returns its workers.dev URL. */
export function deployWorker(name, dsn) {
  nameWorkflowsAfterWorker(name);
  const outputDir = mkdtempSync(join(tmpdir(), 'wrangler-output-'));
  const outputFile = join(outputDir, 'output.ndjson');

  try {
    wrangler(['deploy', '--name', name, '--var', `E2E_TEST_DSN:${dsn}`], { WRANGLER_OUTPUT_FILE_PATH: outputFile });

    const url = readFileSync(outputFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line))
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

export function deleteWorker(name) {
  wrangler(['delete', '--name', name, '--force']);
}

/**
 * CI keeps its Workers: one per ref, overwritten by the next run of the same ref and deleted by the
 * cleanup workflow once a PR closes. Local runs delete theirs unless `E2E_KEEP_WORKER` is set.
 */
export function keepsWorker() {
  return Boolean(process.env.GITHUB_ACTIONS || process.env.E2E_KEEP_WORKER);
}

/** A freshly created workers.dev route can take a moment to become reachable. */
export async function waitForWorker(url) {
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
