import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import {
  getActiveSpan,
  getRootSpan,
  logger,
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  startSpan,
} from '@sentry/core';
import type * as reactRouter from 'react-router';
import { DEBUG_BUILD } from '../../common/debug-build';
import { getOpName, getSpanName, isDataRequest, SEMANTIC_ATTRIBUTE_SENTRY_OVERWRITE } from './util';

type ReactRouterModuleExports = typeof reactRouter;

const supportedVersions = ['>=7.0.0'];
const COMPONENT = 'react-router';

/**
 * Instrumentation for React Router's server request handler.
 * This patches the requestHandler function to add Sentry performance monitoring for data loaders.
 */
export class ReactRouterInstrumentation extends InstrumentationBase<InstrumentationConfig> {
  public constructor(config: InstrumentationConfig = {}) {
    super('ReactRouterInstrumentation', SDK_VERSION, config);
  }

  /**
   * Initializes the instrumentation by defining the React Router server modules to be patched.
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  protected init(): InstrumentationNodeModuleDefinition {
    const reactRouterServerModule = new InstrumentationNodeModuleDefinition(
      COMPONENT,
      supportedVersions,
      (moduleExports: ReactRouterModuleExports) => {
        try {
          return this._createPatchedModuleProxy(moduleExports);
        } catch (_) {
          return moduleExports;
        }
      },
    );

    return reactRouterServerModule;
  }

  /**
   * Creates a proxy around the React Router module exports that patches the createRequestHandler function.
   * This allows us to wrap the request handler to add performance monitoring for data loaders and actions.
   */
  private _createPatchedModuleProxy(moduleExports: ReactRouterModuleExports): ReactRouterModuleExports {
    const original = moduleExports.createRequestHandler;
    moduleExports.createRequestHandler = function (this: unknown, ...args: unknown[]) {
      const originalRequestHandler = original.apply(this, args);

      return async function sentryWrappedRequestHandler(request: Request, initialContext?: unknown) {
        let url: URL;
        try {
          url = new URL(request.url);
        } catch (error) {
          return originalRequestHandler(request, initialContext);
        }

        // We currently just want to trace loaders and actions
        if (!isDataRequest(url.pathname)) {
          return originalRequestHandler(request, initialContext);
        }

        const activeSpan = getActiveSpan();
        const rootSpan = activeSpan && getRootSpan(activeSpan);

        if (!rootSpan) {
          DEBUG_BUILD && logger.debug('No active root span found, skipping tracing for data request');
          return originalRequestHandler(request, initialContext);
        }

        // Set the source and overwrite attributes on the root span to ensure the transaction name
        // is derived from the raw URL pathname rather than any parameterized route that may be set later
        // TODO: try to set derived parameterized route from build here (args[0])
        rootSpan.setAttributes({
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          [SEMANTIC_ATTRIBUTE_SENTRY_OVERWRITE]: `${request.method} ${url.pathname}`,
        });

        return startSpan(
          {
            name: getSpanName(url.pathname, request.method),
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react-router',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: getOpName(url.pathname, request.method),
            },
          },
          () => {
            return originalRequestHandler(request, initialContext);
          },
        );
      };
    };

    return moduleExports;
  }
}
