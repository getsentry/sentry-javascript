import type { Integration } from '@sentry/types';

import { expressIntegration } from './express';
import { fastifyIntegration } from './fastify';
import { graphqlIntegration } from './graphql';
import { hapiIntegration } from './hapi';
import { koaIntegration } from './koa';
import { mongoIntegration } from './mongo';
import { mongooseIntegration } from './mongoose';
import { mysqlIntegration } from './mysql';
import { mysql2Integration } from './mysql2';
import { nestIntegration } from './nest';
import { postgresIntegration } from './postgres';
import { prismaIntegration } from './prisma';

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
    postgresIntegration(),
    prismaIntegration(),
    nestIntegration(),
    hapiIntegration(),
    koaIntegration(),
  ];
}
