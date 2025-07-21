import { parseSemver } from '@sentry/core';

export const NODE_VERSION = parseSemver(process.versions.node) as { major: number; minor: number; patch: number };
export const NODE_MAJOR = NODE_VERSION.major;
export const NODE_MINOR = NODE_VERSION.minor;
