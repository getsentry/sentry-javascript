import type { InstrumentationConfig } from '..';
import { toSubscribeInjections } from './subscribe-injection';

export const mysqlConfig = [
  {
    channelName: 'query',
    module: { name: 'mysql', versionRange: '>=2.0.0 <3', filePath: 'lib/Connection.js' },
    functionQuery: { expressionName: 'query', kind: 'Auto' },
  },
] satisfies InstrumentationConfig[];

export const mysqlChannels = {
  MYSQL_QUERY: 'orchestrion:mysql:query',
} as const;

export const mysqlSubscribeInjection = toSubscribeInjections(mysqlConfig);
