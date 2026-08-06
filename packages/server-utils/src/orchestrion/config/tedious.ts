import type { InstrumentationConfig } from '..';
import { getModuleNames } from './module-names';

const MODULE_NAME = 'tedious';

// `Connection` has lived in `lib/connection.js` across the whole supported range (matches the vendored
// OTel `supportedVersions`). Orchestrion never matches a file that doesn't exist, so a single entry is
// safe even for versions that shipped extra layouts.
const FILE_PATH = 'lib/connection.js';
const VERSION_RANGE = '>=1.11.0 <20';

// `Connection` methods that dispatch a request (each traced as one db span) plus `connect`, which the
// subscriber wraps for bookkeeping only (tracking the connection's active database, read into `db.name`).
// All return synchronously; the request completes later via its callback/events, so the subscriber owns
// span-ending rather than the channel lifecycle.
const METHODS = ['connect', 'execSql', 'execSqlBatch', 'callProcedure', 'execBulkLoad', 'prepare', 'execute'] as const;

export const tediousConfig: InstrumentationConfig[] = METHODS.map(methodName => ({
  channelName: methodName,
  module: { name: MODULE_NAME, versionRange: VERSION_RANGE, filePath: FILE_PATH },
  functionQuery: { className: 'Connection', methodName, kind: 'Sync' },
}));

export const tediousModuleNames = getModuleNames(tediousConfig);

export const tediousChannels = {
  TEDIOUS_CONNECT: 'orchestrion:tedious:connect',
  TEDIOUS_EXEC_SQL: 'orchestrion:tedious:execSql',
  TEDIOUS_EXEC_SQL_BATCH: 'orchestrion:tedious:execSqlBatch',
  TEDIOUS_CALL_PROCEDURE: 'orchestrion:tedious:callProcedure',
  TEDIOUS_EXEC_BULK_LOAD: 'orchestrion:tedious:execBulkLoad',
  TEDIOUS_PREPARE: 'orchestrion:tedious:prepare',
  TEDIOUS_EXECUTE: 'orchestrion:tedious:execute',
} as const;
