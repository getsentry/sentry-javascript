// Packages we auto-instrument need to be external for instrumentation to work
// Next.js externalizes some packages by default, see: https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages
// Others we need to add ourselves
//
// NOTE: 'ai' (Vercel AI SDK) is intentionally NOT included in this list.
// When externalized, Next.js doesn't properly handle the package's conditional exports,
// specifically the "react-server" export condition. This causes client-side code to be
// loaded in server components instead of the appropriate server-side functions.
export const DEFAULT_SERVER_EXTERNAL_PACKAGES = [
  'amqplib',
  'connect',
  'dataloader',
  'express',
  'generic-pool',
  'graphql',
  '@hapi/hapi',
  'ioredis',
  'kafkajs',
  'koa',
  'lru-memoizer',
  'mongodb',
  'mongoose',
  'mysql',
  'mysql2',
  'knex',
  'pg',
  'pg-pool',
  '@node-redis/client',
  '@redis/client',
  'redis',
  'tedious',
];
