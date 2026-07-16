import type { InstrumentationConfig } from '@apm-js-collab/code-transformer-bundler-plugins/core';

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
