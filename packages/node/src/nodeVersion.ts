import { parseSemver } from '@sentry/utils';

export const NODE_VERSION: ReturnType<typeof parseSemver> = parseSemver(process.versions.node);
