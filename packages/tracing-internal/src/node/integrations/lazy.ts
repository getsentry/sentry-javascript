import type { Integration, IntegrationClass } from '@sentry/types';
import { dynamicRequire } from '@sentry/utils';

export const lazyLoadedNodePerformanceMonitoringIntegrations: (() => Integration)[] = [
  () => {
    const integration = dynamicRequire(module, './apollo') as {
      Apollo: IntegrationClass<Integration>;
    };
    return new integration.Apollo();
  },
  () => {
    const integration = dynamicRequire(module, './apollo') as {
      Apollo: IntegrationClass<Integration>;
    };
    return new integration.Apollo({ useNestjs: true });
  },
  () => {
    const integration = dynamicRequire(module, './graphql') as {
      GraphQL: IntegrationClass<Integration>;
    };
    return new integration.GraphQL();
  },
  () => {
    const integration = dynamicRequire(module, './mongo') as {
      Mongo: IntegrationClass<Integration>;
    };
    return new integration.Mongo();
  },
  () => {
    const integration = dynamicRequire(module, './mongo') as {
      Mongo: IntegrationClass<Integration>;
    };
    return new integration.Mongo({ mongoose: true });
  },
  () => {
    const integration = dynamicRequire(module, './mysql') as {
      Mysql: IntegrationClass<Integration>;
    };
    return new integration.Mysql();
  },
  () => {
    const integration = dynamicRequire(module, './postgres') as {
      Postgres: IntegrationClass<Integration>;
    };
    return new integration.Postgres();
  },
];
