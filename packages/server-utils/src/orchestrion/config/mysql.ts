import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';

export const mysqlConfig = [
  {
    channelName: 'query',
    module: { name: 'mysql', versionRange: '>=2.0.0 <3', filePath: 'lib/Connection.js' },
    functionQuery: { expressionName: 'query', kind: 'Auto' },
  },
] satisfies InstrumentationConfig[];

export const mysqlModuleNames = getModuleNames(mysqlConfig);

export const mysqlChannels = {
  MYSQL_QUERY: 'orchestrion:mysql:query',
} as const;
