import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { SEMATTRS_HTTP_TARGET } from '@opentelemetry/semantic-conventions';
import {
  debug,
  getActiveSpan,
  getRootSpan,
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  spanToJSON,
  startSpan,
  updateSpanName,
} from '@sentry/core';
import type * as reactRouter from 'react-router';
import { DEBUG_BUILD } from '../../common/debug-build';
import { isInstrumentationApiUsed } from '../serverGlobals';
import { getOpName, getSpanName, isDataRequest } from './util';

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
          return function sentryWrappedCreateRequestHandler(this: unknown, ...args: unknown[]) {
            const originalRequestHandler = original.apply(this, args);

            return async function sentryWrappedRequestHandler(request: Request, initialContext?: unknown) {
              let url: URL;
              try {
                url = new URL(request.url);
              } catch {
                return originalRequestHandler(request, initialContext);
              }

              // We currently just want to trace loaders and actions
              if (!isDataRequest(url.pathname)) {
                return originalRequestHandler(request, initialContext);
              }

              // Skip OTEL instrumentation if instrumentation API is being used
              // as it handles loader/action spans itself
              if (isInstrumentationApiUsed()) {
                DEBUG_BUILD && debug.log('Skipping OTEL loader/action instrumentation - using instrumentation API');
                return originalRequestHandler(request, initialContext);
              }

              const activeSpan = getActiveSpan();
              const rootSpan = activeSpan && getRootSpan(activeSpan);

              if (!rootSpan) {
                DEBUG_BUILD && debug.log('No active root span found, skipping tracing for data request');
                return originalRequestHandler(request, initialContext);
              }

              // We cannot rely on the regular span name inferral here, as the express instrumentation sets `*` as the route
              // So we force this to be a more sensible name here
              // TODO: try to set derived parameterized route from build here (args[0])
              const spanData = spanToJSON(rootSpan);
              // eslint-disable-next-line deprecation/deprecation
              const target = spanData.data[SEMATTRS_HTTP_TARGET] || url.pathname;
              updateSpanName(rootSpan, `${request.method} ${target}`);
              rootSpan.setAttributes({
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.server',
              });

              return startSpan(
                {
                  name: getSpanName(url.pathname, request.method),
                  attributes: {
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.server',
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: getOpName(url.pathname, request.method),
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
