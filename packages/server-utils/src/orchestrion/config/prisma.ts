import type { InstrumentationConfig } from '../apmTypes';
import { getModuleNames } from './module-names';

// Prisma 8 has no tracing surface, so its ORM terminals are wrapped directly. Apps install
// `@prisma/orm-postgres`, but `CollectionImpl` lives in the transitive `@prisma/orm-family-sql`.
const MODULE_NAME = '@prisma/orm-family-sql';
const ORM_CLIENT_FILE = 'dist/orm-client.mjs';

// The range matcher admits every `8.0.0-rc.*`, not just rc.8 and later; the terminals were verified on rc.8.
const VERSION_RANGE = '>=8.0.0-rc.8 <9';

export const PRISMA_ASYNC_TERMINALS = [
  'aggregate',
  'first',
  'create',
  'createAndCount',
  'upsert',
  'update',
  'updateAndCount',
  'delete',
  'deleteAndCount',
] as const;

// These return a single-use thenable whose query runs on consumption. `Sync` on purpose: the `Async`/`Auto`
// wrapper calls `.then()` on non-native thenables and would consume the result before the app does.
export const PRISMA_LAZY_TERMINALS = ['all', 'createAll', 'updateAll', 'deleteAll'] as const;

type PrismaTerminal = (typeof PRISMA_ASYNC_TERMINALS)[number] | (typeof PRISMA_LAZY_TERMINALS)[number];

function terminalConfig(methodName: PrismaTerminal, kind: 'Async' | 'Sync'): InstrumentationConfig {
  return {
    channelName: methodName,
    module: { name: MODULE_NAME, versionRange: VERSION_RANGE, filePath: ORM_CLIENT_FILE },
    functionQuery: { className: 'CollectionImpl', methodName, kind },
  };
}

export const prismaConfig: InstrumentationConfig[] = [
  ...PRISMA_ASYNC_TERMINALS.map(methodName => terminalConfig(methodName, 'Async')),
  ...PRISMA_LAZY_TERMINALS.map(methodName => terminalConfig(methodName, 'Sync')),
];

export const prismaModuleNames = getModuleNames(prismaConfig);

export const prismaChannels = {
  PRISMA_AGGREGATE: 'orchestrion:@prisma/orm-family-sql:aggregate',
  PRISMA_FIRST: 'orchestrion:@prisma/orm-family-sql:first',
  PRISMA_CREATE: 'orchestrion:@prisma/orm-family-sql:create',
  PRISMA_CREATE_AND_COUNT: 'orchestrion:@prisma/orm-family-sql:createAndCount',
  PRISMA_UPSERT: 'orchestrion:@prisma/orm-family-sql:upsert',
  PRISMA_UPDATE: 'orchestrion:@prisma/orm-family-sql:update',
  PRISMA_UPDATE_AND_COUNT: 'orchestrion:@prisma/orm-family-sql:updateAndCount',
  PRISMA_DELETE: 'orchestrion:@prisma/orm-family-sql:delete',
  PRISMA_DELETE_AND_COUNT: 'orchestrion:@prisma/orm-family-sql:deleteAndCount',
  PRISMA_ALL: 'orchestrion:@prisma/orm-family-sql:all',
  PRISMA_CREATE_ALL: 'orchestrion:@prisma/orm-family-sql:createAll',
  PRISMA_UPDATE_ALL: 'orchestrion:@prisma/orm-family-sql:updateAll',
  PRISMA_DELETE_ALL: 'orchestrion:@prisma/orm-family-sql:deleteAll',
} as const;
