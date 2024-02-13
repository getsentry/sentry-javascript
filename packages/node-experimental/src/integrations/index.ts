import { Integrations as NodeIntegrations } from '@sentry/node';

const {
  Console,
  OnUncaughtException,
  OnUnhandledRejection,
  Modules,
  ContextLines,
  Context,
  RequestData,
  // eslint-disable-next-line deprecation/deprecation
} = NodeIntegrations;

export { Console, OnUncaughtException, OnUnhandledRejection, Modules, ContextLines, Context, RequestData };

/* eslint-disable deprecation/deprecation */
export { Express } from './express';
export { Http } from './http';
export { NodeFetch } from './node-fetch';
export { Fastify } from './fastify';
export { GraphQL } from './graphql';
export { Mongo } from './mongo';
export { Mongoose } from './mongoose';
export { Mysql } from './mysql';
export { Mysql2 } from './mysql2';
export { Nest } from './nest';
export { Postgres } from './postgres';
export { Prisma } from './prisma';
