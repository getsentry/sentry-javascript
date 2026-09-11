import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function wrangler(args) {
  const output = execFileSync('pnpm', ['exec', 'wrangler', ...args], {
    cwd: __dirname,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  console.log(output);
  return output;
}

/** Deploys the worker under `name` and returns its workers.dev URL. */
export function deployWorker(name, dsn) {
  const output = wrangler(['deploy', '--name', name, '--var', `E2E_TEST_DSN:${dsn}`]);
  const url = output.match(/https:\/\/\S+\.workers\.dev/)?.[0];

  if (!url) {
    throw new Error(`Could not find the workers.dev URL in the wrangler deploy output for ${name}.`);
  }

  return url;
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
