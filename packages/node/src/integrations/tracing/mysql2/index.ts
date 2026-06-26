import { MySQL2Instrumentation } from './vendored/instrumentation';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, extendIntegration } from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node-core';
import { mysql2Integration as mysql2ChannelIntegration } from '@sentry/server-utils';

const INTEGRATION_NAME = 'Mysql2' as const;

export const instrumentMysql2 = generateInstrumentOnce(INTEGRATION_NAME, () => new MySQL2Instrumentation());

const _mysql2Integration = (() => {
  // The diagnostics_channel subscription (mysql2 >= 3.20.0) lives in server-utils so it is shared
  // across server runtimes; we extend it here to also run the vendored OTel patcher for mysql2 < 3.20.0.
  return extendIntegration(mysql2ChannelIntegration(), {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentMysql2();
    },
  });
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [mysql2](https://www.npmjs.com/package/mysql2) library.
 *
 * For more information, see the [`mysql2Integration` documentation](https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/mysql2/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *  integrations: [Sentry.mysqlIntegration()],
 * });
 * ```
 */
export const mysql2Integration = defineIntegration(_mysql2Integration);
