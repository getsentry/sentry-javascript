import { parseSemver } from '@sentry/utils';

export const NODE_VERSION = parseSemver(process.versions.node) as { major: number; minor: number; patch: number };
export const NODE_MAJOR = NODE_VERSION.major;
