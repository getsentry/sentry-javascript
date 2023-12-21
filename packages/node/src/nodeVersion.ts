import { parseSemver } from '@sentry/utils';

type SemVerNotOptional = Required<Pick<ReturnType<typeof parseSemver>, 'major' | 'minor' | 'patch'>>;

export const NODE_VERSION = parseSemver(process.versions.node) as SemVerNotOptional;
