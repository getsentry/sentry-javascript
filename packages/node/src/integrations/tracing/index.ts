import type { Integration } from '@sentry/types';
import { instrumentOtelHttp } from '../http';

import { amqplibIntegration, instrumentAmqplib } from './amqplib';
import { connectIntegration, instrumentConnect } from './connect';
import { expressIntegration, instrumentExpress } from './express';
import { fastifyIntegration, instrumentFastify } from './fastify';
import { genericPoolIntegration, instrumentGenericPool } from './genericPool';
import { graphqlIntegration, instrumentGraphql } from './graphql';
import { hapiIntegration, instrumentHapi } from './hapi';
import { instrumentKafka, kafkaIntegration } from './kafka';
import { instrumentKoa, koaIntegration } from './koa';
import { instrumentLruMemoizer, lruMemoizerIntegration } from './lrumemoizer';
import { instrumentMongo, mongoIntegration } from './mongo';
import { instrumentMongoose, mongooseIntegration } from './mongoose';
import { instrumentMysql, mysqlIntegration } from './mysql';
import { instrumentMysql2, mysql2Integration } from './mysql2';
import { instrumentNest, nestIntegration } from './nest/nest';
import { instrumentPostgres, postgresIntegration } from './postgres';
import { instrumentRedis, redisIntegration } from './redis';
import { instrumentTedious, tediousIntegration } from './tedious';

/**
 * With OTEL, all performance integrations will be added, as OTEL only initializes them when the patched package is actually required.
 */
export function getAutoPerformanceIntegrations(): Integration[] {
  return [
    expressIntegration(),
    fastifyIntegration(),
    graphqlIntegration(),
    mongoIntegration(),
    mongooseIntegration(),
    mysqlIntegration(),
    mysql2Integration(),
    redisIntegration(),
    postgresIntegration(),
    // For now, we do not include prisma by default because it has ESM issues
    // See https://github.com/prisma/prisma/issues/23410
    // TODO v8: Figure out a better solution for this, maybe only disable in ESM mode?
    // prismaIntegration(),
    nestIntegration(),
    hapiIntegration(),
    koaIntegration(),
    connectIntegration(),
    tediousIntegration(),
    genericPoolIntegration(),
    kafkaIntegration(),
    amqplibIntegration(),
    lruMemoizerIntegration(),
  ];
}

/**
 * Get a list of methods to instrument OTEL, when preload instrumentation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getOpenTelemetryInstrumentationToPreload(): (((options?: any) => void) & { id: string })[] {
  return [
    instrumentOtelHttp,
    instrumentExpress,
    instrumentConnect,
    instrumentFastify,
    instrumentHapi,
    instrumentKafka,
    instrumentKoa,
    instrumentLruMemoizer,
    instrumentNest,
    instrumentMongo,
    instrumentMongoose,
    instrumentMysql,
    instrumentMysql2,
    instrumentPostgres,
    instrumentHapi,
    instrumentGraphql,
    instrumentRedis,
    instrumentTedious,
    instrumentGenericPool,
    instrumentAmqplib,
  ];
}
