import { parseSemver } from '@sentry/core';
import { createRequire } from 'module';

// `wrangler dev` runs the workerd that its own miniflare depends on.
const wranglerRequire = createRequire(createRequire(__filename).resolve('wrangler/package.json'));
const miniflareRequire = createRequire(wranglerRequire.resolve('miniflare/package.json'));
const WORKERD_VERSION = parseSemver((miniflareRequire('workerd/package.json') as { version: string }).version);

export type Requirements = {
  /** Lowest workerd version that runs the tests, for example `1.20261009.1`. */
  minWorkerd?: string;
};

/**
 * Whether the workerd that runs the Workers meets the requirements of the tests, for use in `it.runIf` and
 * `it.skipIf`. The pinned wrangler of the required CI job runs an older workerd than the latest wrangler of the
 * optional CI job.
 */
export function supports({ minWorkerd }: Requirements): boolean {
  if (!minWorkerd) {
    return true;
  }

  const required = parseSemver(minWorkerd);
  const difference =
    (WORKERD_VERSION.major || 0) - (required.major || 0) ||
    (WORKERD_VERSION.minor || 0) - (required.minor || 0) ||
    (WORKERD_VERSION.patch || 0) - (required.patch || 0);

  return difference >= 0;
}
