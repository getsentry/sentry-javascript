import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import {
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  startSpan,
} from '@sentry/core';
import type * as reactRouter from 'react-router';
import { isActionRequest, isDataRequest, isLoaderRequest } from './util';

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
        return this._createPatchedModuleProxy(moduleExports);
      },
      (_moduleExports: unknown) => {
        // nothing to unwrap here
        return _moduleExports;
      },
    );

    return reactRouterServerModule;
  }

  /**
   * Creates a proxy around the React Router module exports that patches the createRequestHandler function.
   * This allows us to wrap the request handler to add performance monitoring for data loaders and actions.
   */
  private _createPatchedModuleProxy(moduleExports: ReactRouterModuleExports): ReactRouterModuleExports {
    return new Proxy(moduleExports, {
      get(target, prop, receiver) {
        if (prop === 'createRequestHandler') {
          const original = target[prop];
          return function wrappedCreateRequestHandler(this: unknown, ...args: any[]) {
            const originalRequestHandler = original.apply(this, args);

            return async function wrappedRequestHandler(request: Request, initialContext?: any) {
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

              // All data requests end with .data
              let txName = url.pathname.replace(/\.data$/, '');

              if (isLoaderRequest(url.pathname, request.method)) {
                txName = `Loader ${txName}`;
              } else if (isActionRequest(url.pathname, request.method)) {
                txName = `Action ${txName}`;
              }

              return startSpan(
                {
                  name: txName,
                  attributes: {
                    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react-router',
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
                    url: url.pathname,
                    method: request.method,
                  },
                },
                () => {
                  return originalRequestHandler(request, initialContext);
                },
              );
            };
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }
}
