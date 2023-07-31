import type { Integration, IntegrationClass } from '@sentry/types';
import { dynamicRequire } from '@sentry/utils';

import type { Express } from './express';
import type { Fastify } from './fastify';
import type { GraphQL } from './graphql';
import type { Mongo } from './mongo';
import type { Mongoose } from './mongoose';
import type { Mysql } from './mysql';
import type { Mysql2 } from './mysql2';
import type { Nest } from './nest';
import type { Postgres } from './postgres';
import type { Prisma } from './prisma';

const INTEGRATIONS = [
  () => {
    const integration = dynamicRequire(module, './express') as {
      Express: IntegrationClass<Express>;
    };
    return new integration.Express();
  },
  () => {
    const integration = dynamicRequire(module, './fastify') as {
      Fastify: IntegrationClass<Fastify>;
    };
    return new integration.Fastify();
  },
  () => {
    const integration = dynamicRequire(module, './graphql') as {
      GraphQL: IntegrationClass<GraphQL>;
    };
    return new integration.GraphQL();
  },
  () => {
    const integration = dynamicRequire(module, './mongo') as {
      Mongo: IntegrationClass<Mongo>;
    };
    return new integration.Mongo();
  },
  () => {
    const integration = dynamicRequire(module, './mongoose') as {
      Mongoose: IntegrationClass<Mongoose>;
    };
    return new integration.Mongoose();
  },
  () => {
    const integration = dynamicRequire(module, './mysql') as {
      Mysql: IntegrationClass<Mysql>;
    };
    return new integration.Mysql();
  },
  () => {
    const integration = dynamicRequire(module, './mysql2') as {
      Mysql2: IntegrationClass<Mysql2>;
    };
    return new integration.Mysql2();
  },
  () => {
    const integration = dynamicRequire(module, './postgres') as {
      Postgres: IntegrationClass<Postgres>;
    };
    return new integration.Postgres();
  },
  () => {
    const integration = dynamicRequire(module, './prisma') as {
      Prisma: IntegrationClass<Prisma>;
    };
    return new integration.Prisma();
  },
  () => {
    const integration = dynamicRequire(module, './nest') as {
      Nest: IntegrationClass<Nest>;
    };
    return new integration.Nest();
  },
];

/** TODO */
export function getAutoPerformanceIntegrations(): Integration[] {
  const loadedIntegrations = INTEGRATIONS.map(tryLoad => {
    try {
      return tryLoad();
    } catch (_) {
      return undefined;
    }
  }).filter(integration => !!integration) as Integration[];

  return loadedIntegrations;
}
