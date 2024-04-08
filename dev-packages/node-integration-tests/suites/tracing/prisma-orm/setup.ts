import { execSync } from 'child_process';
import { parseSemver } from '@sentry/utils';

const NODE_VERSION = parseSemver(process.versions.node);

// Prisma v5 requires Node.js v16+
// https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-5#nodejs-minimum-version-change
if (NODE_VERSION.major && NODE_VERSION.major < 16) {
  // eslint-disable-next-line no-console
  console.warn(`Skipping Prisma tests on Node: ${NODE_VERSION.major}`);
  process.exit(0);
}

try {
  execSync('yarn && yarn setup');
} catch (_) {
  process.exit(1);
}
