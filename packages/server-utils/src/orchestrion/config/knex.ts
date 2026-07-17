import type { InstrumentationConfig } from '..';
import { getModuleNames } from './utils';

const MODULE_NAME = 'knex';

// knex ships different file layouts across versions (see `SUPPORTED_VERSIONS` in the vendored OTel
// instrumentation). Modern builds keep the runner under `lib/execution`, older ones under `lib`, and
// the source-tree build under `src`. A file that doesn't exist for a given version simply never
// matches, so overlapping ranges are safe.
const RUNNER_FILES = [
  { filePath: 'lib/execution/runner.js', versionRange: '>=0.22.0 <4' },
  { filePath: 'lib/runner.js', versionRange: '>=0.10.0 <0.22.0' },
  { filePath: 'src/runner.js', versionRange: '>=0.18.0 <0.19.0' },
];

const CLIENT_FILES = [
  { filePath: 'lib/client.js', versionRange: '>=0.10.0 <4' },
  { filePath: 'src/client.js', versionRange: '>=0.18.0 <0.19.0' },
];

// The three `Client` methods that create a builder. Wrapping them lets the subscriber capture the
// span active at builder-creation time, which is reused as the parent when the query runs later
// (often in a different async context).
const CLIENT_METHODS = ['queryBuilder', 'schemaBuilder', 'raw'] as const;

function runnerQuery(filePath: string, versionRange: string): InstrumentationConfig {
  return {
    channelName: 'query',
    module: { name: MODULE_NAME, versionRange, filePath },
    functionQuery: { className: 'Runner', methodName: 'query', kind: 'Async' },
  };
}

function clientMethod(methodName: string, filePath: string, versionRange: string): InstrumentationConfig {
  return {
    channelName: methodName,
    module: { name: MODULE_NAME, versionRange, filePath },
    functionQuery: { className: 'Client', methodName, kind: 'Sync' },
  };
}

export const knexConfig: InstrumentationConfig[] = [
  ...RUNNER_FILES.map(({ filePath, versionRange }) => runnerQuery(filePath, versionRange)),
  ...CLIENT_FILES.flatMap(({ filePath, versionRange }) =>
    CLIENT_METHODS.map(methodName => clientMethod(methodName, filePath, versionRange)),
  ),
] as const satisfies InstrumentationConfig[];

export const knexModuleNames = getModuleNames(knexConfig);

export const knexChannels = {
  KNEX_QUERY: 'orchestrion:knex:query',
  KNEX_QUERY_BUILDER: 'orchestrion:knex:queryBuilder',
  KNEX_SCHEMA_BUILDER: 'orchestrion:knex:schemaBuilder',
  KNEX_RAW: 'orchestrion:knex:raw',
} as const;
