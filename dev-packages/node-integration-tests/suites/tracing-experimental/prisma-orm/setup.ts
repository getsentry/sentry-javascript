import { execSync } from 'child_process';
import { parseSemver } from '@sentry/utils';

const NODE_VERSION = parseSemver(process.versions.node);

if (NODE_VERSION.major && NODE_VERSION.major < 12) {
  // eslint-disable-next-line no-console
  console.warn(`Skipping Prisma tests on Node: ${NODE_VERSION.major}`);
  process.exit(0);
}

try {
  execSync('yarn && yarn setup');
} catch (_) {
  process.exit(1);
}
