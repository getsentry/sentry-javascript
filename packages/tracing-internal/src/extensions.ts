import { addTracingExtensions, getMainCarrier } from '@sentry/core';
import type { Integration, IntegrationClass } from '@sentry/types';
import { dynamicRequire, isNodeEnv, loadModule } from '@sentry/utils';

/**
 * @private
 */
function _autoloadDatabaseIntegrations(): void {
  const carrier = getMainCarrier();
  if (!carrier.__SENTRY__) {
    return;
  }

  const packageToIntegrationMapping: Record<string, () => Integration> = {
    mongodb() {
      const integration = dynamicRequire(module, './node/integrations/mongo') as {
        Mongo: IntegrationClass<Integration>;
      };
      return new integration.Mongo();
    },
    mongoose() {
      const integration = dynamicRequire(module, './node/integrations/mongo') as {
        Mongo: IntegrationClass<Integration>;
      };
      return new integration.Mongo();
    },
    mysql() {
      const integration = dynamicRequire(module, './node/integrations/mysql') as {
        Mysql: IntegrationClass<Integration>;
      };
      return new integration.Mysql();
    },
    pg() {
      const integration = dynamicRequire(module, './node/integrations/postgres') as {
        Postgres: IntegrationClass<Integration>;
      };
      return new integration.Postgres();
    },
  };

  const mappedPackages = Object.keys(packageToIntegrationMapping)
    .filter(moduleName => !!loadModule(moduleName))
    .map(pkg => {
      try {
        return packageToIntegrationMapping[pkg]();
      } catch (e) {
        return undefined;
      }
    })
    .filter(p => p) as Integration[];

  if (mappedPackages.length > 0) {
    carrier.__SENTRY__.integrations = [...(carrier.__SENTRY__.integrations || []), ...mappedPackages];
  }
}

/**
 * This patches the global object and injects the Tracing extensions methods
 */
export function addExtensionMethods(): void {
  addTracingExtensions();

  // Detect and automatically load specified integrations.
  if (isNodeEnv()) {
    _autoloadDatabaseIntegrations();
  }
}
