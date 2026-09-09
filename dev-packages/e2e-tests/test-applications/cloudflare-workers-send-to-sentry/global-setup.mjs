import { randomBytes } from 'node:crypto';
import { deleteWorker, deployWorker, keepsWorker, waitForWorker } from './deployed-worker.mjs';

const WORKER_PREFIX = 'e2e-send-to-sentry';

/**
 * In CI the name follows the ref, so `develop`, `master` and every PR get a stable Worker that the
 * next run of the same ref overwrites. Pull request refs look like `123/merge` and merge queue refs
 * like `gh-readonly-queue/<base>/pr-123-<sha>`; both map to the PR's Worker.
 */
export function getWorkerName() {
  if (!process.env.GITHUB_ACTIONS) {
    return `${WORKER_PREFIX}-local-${randomBytes(3).toString('hex')}`;
  }

  const { GITHUB_EVENT_NAME, GITHUB_REF_NAME = '' } = process.env;
  const prNumber =
    GITHUB_EVENT_NAME === 'pull_request' ? GITHUB_REF_NAME.split('/')[0] : /\/pr-(\d+)-/.exec(GITHUB_REF_NAME)?.[1];
  const ref = prNumber ? `pr-${prNumber}` : GITHUB_REF_NAME;
  // Worker names allow lowercase alphanumerics and dashes only, up to 63 characters.
  const slug = ref.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return `${WORKER_PREFIX}-${slug}`.slice(0, 63).replace(/-+$/, '');
}

export default async function globalSetup() {
  const { CLOUDFLARE_ACCOUNT_ID, E2E_TEST_DSN } = process.env;

  // Wrangler authenticates with `CLOUDFLARE_API_TOKEN` (CI) or a `wrangler login` session (local),
  // but it cannot pick an account on its own outside of a terminal.
  if (!CLOUDFLARE_ACCOUNT_ID) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID must be set to deploy the test worker.');
  }

  const workerName = getWorkerName();
  const workerUrl = deployWorker(workerName, E2E_TEST_DSN);
  process.env.E2E_TEST_WORKER_NAME = workerName;

  try {
    await waitForWorker(workerUrl);
  } catch (error) {
    if (!keepsWorker()) {
      try {
        deleteWorker(workerName);
      } catch (deleteError) {
        // The unreachable worker is the failure to report, not the cleanup.
        console.error(`Failed to delete worker ${workerName}:`, deleteError);
      }
    }
    throw error;
  }

  process.env.E2E_TEST_WORKER_URL = workerUrl;
}
