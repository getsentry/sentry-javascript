import type { InstrumentationConfig } from '..';
import { uniq } from '@sentry/core';

export const mysqlConfig = [
  {
    channelName: 'query',
    module: { name: 'mysql', versionRange: '>=2.0.0 <3', filePath: 'lib/Connection.js' },
    functionQuery: { expressionName: 'query', kind: 'Auto' },
  },
] as const satisfies InstrumentationConfig[];

export const mysqlModuleNames = uniq(mysqlConfig.map(config => config.module.name));

export const mysqlChannels = {
  MYSQL_QUERY: 'orchestrion:mysql:query',
} as const;
