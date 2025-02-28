import FastifyOtelInstrumentation from '@fastify/otel';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  captureException,
  defineIntegration,
  getClient,
  getIsolationScope,
  parseSemver,
  spanToJSON,
} from '@sentry/core';
import type { IntegrationFn, Span } from '@sentry/core';
import { generateInstrumentOnce } from '../../otel/instrument';
import { FastifyInstrumentationV3 } from './fastify-v3/instrumentation';

import type { FastifyInstance } from './fastify-v3/internal-types';
/**
 * Minimal request type containing properties around route information.
 * Works for Fastify 3, 4 and 5.
 */
interface FastifyRequestRouteInfo {
  method?: string;
  // since fastify@4.10.0
  routeOptions?: {
    url?: string;
  };
  routerPath?: string;
}

const INTEGRATION_NAME = 'Fastify';
const INTEGRATION_NAME_V3 = 'Fastify-V3';

export const instrumentFastifyV3 = generateInstrumentOnce(
  INTEGRATION_NAME_V3,
  () =>
    new FastifyInstrumentationV3({
      requestHook(span) {
        addFastifySpanAttributes(span);
      },
    }),
);

let fastifyOtelInstrumentationInstance: FastifyOtelInstrumentation | undefined;

function checkFastifyVersion(): ReturnType<typeof parseSemver> | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('fastify/package.json') as { version?: string };
    return pkg?.version ? parseSemver(pkg.version) : undefined;
  } catch {
    return undefined;
  }
}

export const instrumentFastify = generateInstrumentOnce(INTEGRATION_NAME, () => {
  // FastifyOtelInstrumentation does not have a `requestHook`
  // so we can't use `addFastifySpanAttributes` here for now
  fastifyOtelInstrumentationInstance = new FastifyOtelInstrumentation({
    // registerOnInitialization: true,
  });
  return fastifyOtelInstrumentationInstance;
});

const _fastifyIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentFastifyV3();

      const fastifyVersion = checkFastifyVersion();
      if (fastifyVersion?.major && fastifyVersion.major >= 4) {
        instrumentFastify();
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for [Fastify](https://fastify.dev/).
 *
 * If you also want to capture errors, you need to call `setupFastifyErrorHandler(app)` after you set up your Fastify server.
 *
 * For more information, see the [fastify documentation](https://docs.sentry.io/platforms/javascript/guides/fastify/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *   integrations: [Sentry.fastifyIntegration()],
 * })
 * ```
 */
export const fastifyIntegration = defineIntegration(_fastifyIntegration);

/**
 * Add an Fastify error handler to capture errors to Sentry.
 *
 * @param fastify The Fastify instance to which to add the error handler
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 * const Fastify = require("fastify");
 *
 * const app = Fastify();
 *
 * Sentry.setupFastifyErrorHandler(app);
 *
 * // Add your routes, etc.
 *
 * app.listen({ port: 3000 });
 * ```
 */
export function setupFastifyErrorHandler(fastify: FastifyInstance): void {
  const plugin = Object.assign(
    function (fastify: FastifyInstance, _options: unknown, done: () => void): void {
      fastify.addHook('onError', async (_request, _reply, error) => {
        captureException(error);
      });

      // registering `onRequest` hook here instead of using Otel `onRequest` callback b/c `onRequest` hook
      // is ironically called in the fastify `preHandler` hook which is called later in the lifecycle:
      // https://fastify.dev/docs/latest/Reference/Lifecycle/
      fastify.addHook('onRequest', async (request, _reply) => {
        const reqWithRouteInfo = request as FastifyRequestRouteInfo;

        // Taken from Otel Fastify instrumentation:
        // https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/plugins/node/opentelemetry-instrumentation-fastify/src/instrumentation.ts#L94-L96
        const routeName = reqWithRouteInfo.routeOptions?.url || reqWithRouteInfo.routerPath;
        const method = reqWithRouteInfo.method || 'GET';

        getIsolationScope().setTransactionName(`${method} ${routeName}`);
      });

      done();
    },
    {
      [Symbol.for('skip-override')]: true,
      [Symbol.for('fastify.display-name')]: 'sentry-fastify-error-handler',
    },
  );

  // Sadly, middleware spans do not go through `requestHook`, so we handle those here
  // We register this hook in this method, because if we register it in the integration `setup`,
  // it would always run even for users that are not even using fastify
  const client = getClient();
  if (client) {
    client.on('spanStart', span => {
      addFastifySpanAttributes(span);
    });
  }

  // // Need to check because the @fastify/otel's plugin crashes the app in the runtime
  // // if the version is not supported
  // let fastifyVersion = fastify.version ? parseSemver(fastify.version) : undefined;

  // if (!fastifyVersion) {
  //   // try reading the version from the package.json
  //   try {
  //     // eslint-disable-next-line @typescript-eslint/no-var-requires
  //     const pkg = require('fastify/package.json');
  //     if (pkg?.version) {
  //       fastifyVersion = parseSemver(pkg.version);
  //     }
  //   } catch {
  //     // ignore
  //   }
  // }

  // if (fastifyOtelInstrumentationInstance?.isEnabled() && fastifyVersion?.major && fastifyVersion.major >= 4) {
  //   // Can't use `await` here
  //   // eslint-disable-next-line @typescript-eslint/no-floating-promises
  //   fastify.register(fastifyOtelInstrumentationInstance?.plugin());
  // }

  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  fastify.register(plugin);
}

function addFastifySpanAttributes(span: Span): void {
  const attributes = spanToJSON(span).data;

  // this is one of: middleware, request_handler
  const type = attributes['fastify.type'];

  // If this is already set, or we have no fastify span, no need to process again...
  if (attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] || !type) {
    return;
  }

  span.setAttributes({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.fastify',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `${type}.fastify`,
  });

  // Also update the name, we don't need to "middleware - " prefix
  const name = attributes['fastify.name'] || attributes['plugin.name'] || attributes['hook.name'];
  if (typeof name === 'string') {
    // Try removing `fastify -> ` and `@fastify/otel -> ` prefixes
    // This is a bit of a hack, and not always working for all spans
    // But it's the best we can do without a proper API
    const updatedName = name.replace(/^fastify -> /, '').replace(/^@fastify\/otel -> /, '');

    span.updateName(updatedName);
  }
}
