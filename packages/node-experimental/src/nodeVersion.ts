import { parseSemver } from '@sentry/utils';

export const NODE_VERSION = parseSemver(process.versions.node) as {
  major: number | undefined;
  minor: number | undefined;
};
export const NODE_MAJOR = NODE_VERSION.major || 0;
