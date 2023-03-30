import type { Integration, IntegrationClass } from '@sentry/types';
import { dynamicRequire } from '@sentry/utils';

export interface LazyLoadedIntegration<T = object> extends Integration {
  /**
   * Loads the integration's dependency and caches it so it doesn't have to be loaded again.
   *
   * If this returns undefined, the dependency could not be loaded.
   */
  loadDependency(): T | undefined;
}

export const lazyLoadedNodePerformanceMonitoringIntegrations: (() => LazyLoadedIntegration)[] = [
  () => {
    const integration = dynamicRequire(module, './apollo') as {
      Apollo: IntegrationClass<LazyLoadedIntegration>;
    };
    return new integration.Apollo();
  },
  () => {
    const integration = dynamicRequire(module, './apollo') as {
      Apollo: IntegrationClass<LazyLoadedIntegration>;
    };
    return new integration.Apollo({ useNestjs: true });
  },
  () => {
    const integration = dynamicRequire(module, './graphql') as {
      GraphQL: IntegrationClass<LazyLoadedIntegration>;
    };
    return new integration.GraphQL();
  },
  () => {
    const integration = dynamicRequire(module, './mongo') as {
      Mongo: IntegrationClass<LazyLoadedIntegration>;
    };
    return new integration.Mongo();
  },
  () => {
    const integration = dynamicRequire(module, './mongo') as {
      Mongo: IntegrationClass<LazyLoadedIntegration>;
    };
    return new integration.Mongo({ mongoose: true });
  },
  () => {
    const integration = dynamicRequire(module, './mysql') as {
      Mysql: IntegrationClass<LazyLoadedIntegration>;
    };
    return new integration.Mysql();
  },
  () => {
    const integration = dynamicRequire(module, './postgres') as {
      Postgres: IntegrationClass<LazyLoadedIntegration>;
    };
    return new integration.Postgres();
  },
];
