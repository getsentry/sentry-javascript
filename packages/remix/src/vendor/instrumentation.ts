/* eslint-disable deprecation/deprecation */
/* eslint-disable jsdoc/require-jsdoc */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable import/no-named-as-default-member */
/* eslint-disable import/no-duplicates */

// Vendored and modified from:
// https://github.com/justindsmith/opentelemetry-instrumentations-js/blob/3b1e8c3e566e5cc3389e9c28cafce6a5ebb39600/packages/instrumentation-remix/src/instrumentation.ts

/*
 * Copyright Justin Smith
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Span } from '@opentelemetry/api';
import opentelemetry, { SpanStatusCode } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import type { Params } from '@remix-run/router';
import type * as remixRunServerRuntime from '@remix-run/server-runtime';
import type * as remixRunServerRuntimeData from '@remix-run/server-runtime/dist/data';
import type * as remixRunServerRuntimeRouteMatching from '@remix-run/server-runtime/dist/routeMatching';
import type { RouteMatch } from '@remix-run/server-runtime/dist/routeMatching';
import type { ServerRoute } from '@remix-run/server-runtime/dist/routes';
import { SDK_VERSION } from '@sentry/core';

const RemixSemanticAttributes = {
  MATCH_PARAMS: 'match.params',
  MATCH_ROUTE_ID: 'match.route.id',
};

const VERSION = SDK_VERSION;

export interface RemixInstrumentationConfig extends InstrumentationConfig {
  /**
   * Mapping of FormData field to span attribute names. Appends attribute as `formData.${name}`.
   *
   * Provide `true` value to use the FormData field name as the attribute name, or provide
   * a `string` value to map the field name to a custom attribute name.
   *
   * @default { _action: "actionType" }
   */
  actionFormDataAttributes?: Record<string, boolean | string>;
}

const DEFAULT_CONFIG: RemixInstrumentationConfig = {
  actionFormDataAttributes: {
    _action: 'actionType',
  },
};

export class RemixInstrumentation extends InstrumentationBase {
  public constructor(config: RemixInstrumentationConfig = {}) {
    super('RemixInstrumentation', VERSION, Object.assign({}, DEFAULT_CONFIG, config));
  }

  public getConfig(): RemixInstrumentationConfig {
    return this._config;
  }

  public setConfig(config: RemixInstrumentationConfig = {}): void {
    this._config = Object.assign({}, DEFAULT_CONFIG, config);
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  protected init(): InstrumentationNodeModuleDefinition {
    const remixRunServerRuntimeRouteMatchingFile = new InstrumentationNodeModuleFile(
      '@remix-run/server-runtime/dist/routeMatching.js',
      ['2.x'],
      (moduleExports: typeof remixRunServerRuntimeRouteMatching) => {
        // createRequestHandler
        if (isWrapped(moduleExports['matchServerRoutes'])) {
          this._unwrap(moduleExports, 'matchServerRoutes');
        }
        this._wrap(moduleExports, 'matchServerRoutes', this._patchMatchServerRoutes());

        return moduleExports;
      },
      (moduleExports: typeof remixRunServerRuntimeRouteMatching) => {
        this._unwrap(moduleExports, 'matchServerRoutes');
      },
    );

    const remixRunServerRuntimeData_File = new InstrumentationNodeModuleFile(
      '@remix-run/server-runtime/dist/data.js',
      ['2.9.0 - 2.x'],
      (moduleExports: typeof remixRunServerRuntimeData) => {
        // callRouteLoader
        if (isWrapped(moduleExports['callRouteLoader'])) {
          this._unwrap(moduleExports, 'callRouteLoader');
        }
        this._wrap(moduleExports, 'callRouteLoader', this._patchCallRouteLoader());

        // callRouteAction
        if (isWrapped(moduleExports['callRouteAction'])) {
          this._unwrap(moduleExports, 'callRouteAction');
        }
        this._wrap(moduleExports, 'callRouteAction', this._patchCallRouteAction());
        return moduleExports;
      },
      (moduleExports: typeof remixRunServerRuntimeData) => {
        this._unwrap(moduleExports, 'callRouteLoader');
        this._unwrap(moduleExports, 'callRouteAction');
      },
    );

    /*
     * In Remix 2.9.0, the `callXXLoaderRR` functions were renamed to `callXXLoader`.
     */
    const remixRunServerRuntimeDataPre_2_9_File = new InstrumentationNodeModuleFile(
      '@remix-run/server-runtime/dist/data.js',
      ['2.0.0 - 2.8.x'],
      (
        moduleExports: typeof remixRunServerRuntimeData & {
          callRouteLoaderRR: typeof remixRunServerRuntimeData.callRouteLoader;
          callRouteActionRR: typeof remixRunServerRuntimeData.callRouteAction;
        },
      ) => {
        // callRouteLoader
        if (isWrapped(moduleExports['callRouteLoaderRR'])) {
          this._unwrap(moduleExports, 'callRouteLoaderRR');
        }
        this._wrap(moduleExports, 'callRouteLoaderRR', this._patchCallRouteLoader());

        // callRouteAction
        if (isWrapped(moduleExports['callRouteActionRR'])) {
          this._unwrap(moduleExports, 'callRouteActionRR');
        }
        this._wrap(moduleExports, 'callRouteActionRR', this._patchCallRouteAction());
        return moduleExports;
      },
      (
        moduleExports: typeof remixRunServerRuntimeData & {
          callRouteLoaderRR: typeof remixRunServerRuntimeData.callRouteLoader;
          callRouteActionRR: typeof remixRunServerRuntimeData.callRouteAction;
        },
      ) => {
        this._unwrap(moduleExports, 'callRouteLoaderRR');
        this._unwrap(moduleExports, 'callRouteActionRR');
      },
    );

    const remixRunServerRuntimeModule = new InstrumentationNodeModuleDefinition(
      '@remix-run/server-runtime',
      ['2.x'],
      (moduleExports: typeof remixRunServerRuntime) => {
        // createRequestHandler
        if (isWrapped(moduleExports['createRequestHandler'])) {
          this._unwrap(moduleExports, 'createRequestHandler');
        }
        this._wrap(moduleExports, 'createRequestHandler', this._patchCreateRequestHandler());

        return moduleExports;
      },
      (moduleExports: typeof remixRunServerRuntime) => {
        this._unwrap(moduleExports, 'createRequestHandler');
      },
      [remixRunServerRuntimeRouteMatchingFile, remixRunServerRuntimeData_File, remixRunServerRuntimeDataPre_2_9_File],
    );

    return remixRunServerRuntimeModule;
  }

  private _patchMatchServerRoutes(): (original: typeof remixRunServerRuntimeRouteMatching.matchServerRoutes) => any {
    return function matchServerRoutes(original) {
      return function patchMatchServerRoutes(
        this: any,
        ...args: Parameters<typeof original>
      ): RouteMatch<ServerRoute>[] | null {
        const result = original.apply(this, args) as RouteMatch<ServerRoute>[] | null;

        const span = opentelemetry.trace.getSpan(opentelemetry.context.active());

        const route = (result || []).slice(-1)[0]?.route;

        const routePath = route?.path;
        if (span && routePath) {
          span.setAttribute(SemanticAttributes.HTTP_ROUTE, routePath);
          span.updateName(`remix.request ${routePath}`);
        }

        const routeId = route?.id;
        if (span && routeId) {
          span.setAttribute(RemixSemanticAttributes.MATCH_ROUTE_ID, routeId);
        }

        return result;
      };
    };
  }

  private _patchCreateRequestHandler(): (original: typeof remixRunServerRuntime.createRequestHandler) => any {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    return function createRequestHandler(original) {
      return function patchCreateRequestHandler(
        this: any,
        ...args: Parameters<typeof original>
      ): remixRunServerRuntime.RequestHandler {
        const originalRequestHandler: remixRunServerRuntime.RequestHandler = original.apply(this, args);

        return (request: Request, loadContext?: remixRunServerRuntime.AppLoadContext) => {
          const span = plugin.tracer.startSpan(
            'remix.request',
            {
              attributes: { [SemanticAttributes.CODE_FUNCTION]: 'requestHandler' },
            },
            opentelemetry.context.active(),
          );
          addRequestAttributesToSpan(span, request);

          const originalResponsePromise = opentelemetry.context.with(
            opentelemetry.trace.setSpan(opentelemetry.context.active(), span),
            () => originalRequestHandler(request, loadContext),
          );
          return originalResponsePromise
            .then(response => {
              addResponseAttributesToSpan(span, response);
              return response;
            })
            .catch(error => {
              plugin._addErrorToSpan(span, error);
              throw error;
            })
            .finally(() => {
              span.end();
            });
        };
      };
    };
  }

  private _patchCallRouteLoader(): (original: typeof remixRunServerRuntimeData.callRouteLoader) => any {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    return function callRouteLoader(original) {
      return function patchCallRouteLoader(this: any, ...args: Parameters<typeof original>): Promise<Response> {
        const [params] = args;

        const span = plugin.tracer.startSpan(
          `LOADER ${params.routeId}`,
          { attributes: { [SemanticAttributes.CODE_FUNCTION]: 'loader' } },
          opentelemetry.context.active(),
        );

        addRequestAttributesToSpan(span, params.request);
        addMatchAttributesToSpan(span, { routeId: params.routeId, params: params.params });

        return opentelemetry.context.with(opentelemetry.trace.setSpan(opentelemetry.context.active(), span), () => {
          const originalResponsePromise: Promise<Response> = original.apply(this, args);
          return originalResponsePromise
            .then(response => {
              addResponseAttributesToSpan(span, response);
              return response;
            })
            .catch(error => {
              plugin._addErrorToSpan(span, error);
              throw error;
            })
            .finally(() => {
              span.end();
            });
        });
      };
    };
  }

  private _patchCallRouteAction(): (original: typeof remixRunServerRuntimeData.callRouteAction) => any {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    return function callRouteAction(original) {
      return async function patchCallRouteAction(this: any, ...args: Parameters<typeof original>): Promise<Response> {
        const [params] = args;
        const clonedRequest = params.request.clone();
        const span = plugin.tracer.startSpan(
          `ACTION ${params.routeId}`,
          { attributes: { [SemanticAttributes.CODE_FUNCTION]: 'action' } },
          opentelemetry.context.active(),
        );

        addRequestAttributesToSpan(span, clonedRequest);
        addMatchAttributesToSpan(span, { routeId: params.routeId, params: params.params });

        return opentelemetry.context.with(
          opentelemetry.trace.setSpan(opentelemetry.context.active(), span),
          async () => {
            const originalResponsePromise: Promise<Response> = original.apply(this, args);

            return originalResponsePromise
              .then(async response => {
                addResponseAttributesToSpan(span, response);

                try {
                  const formData = await clonedRequest.formData();
                  const { actionFormDataAttributes: actionFormAttributes } = plugin.getConfig();

                  formData.forEach((value: unknown, key: string) => {
                    if (actionFormAttributes?.[key] && typeof value === 'string') {
                      const keyName = actionFormAttributes[key] === true ? key : actionFormAttributes[key];
                      span.setAttribute(`formData.${keyName}`, value.toString());
                    }
                  });
                } catch {
                  // Silently continue on any error. Typically happens because the action body cannot be processed
                  // into FormData, in which case we should just continue.
                }

                return response;
              })
              .catch(async error => {
                plugin._addErrorToSpan(span, error);
                throw error;
              })
              .finally(() => {
                span.end();
              });
          },
        );
      };
    };
  }

  private _addErrorToSpan(span: Span, error: Error): void {
    addErrorEventToSpan(span, error);
  }
}

const addRequestAttributesToSpan = (span: Span, request: Request): void => {
  span.setAttributes({
    [SemanticAttributes.HTTP_METHOD]: request.method,
    [SemanticAttributes.HTTP_URL]: request.url,
  });
};

const addMatchAttributesToSpan = (span: Span, match: { routeId: string; params: Params<string> }): void => {
  span.setAttributes({
    [RemixSemanticAttributes.MATCH_ROUTE_ID]: match.routeId,
  });

  Object.keys(match.params).forEach(paramName => {
    span.setAttribute(`${RemixSemanticAttributes.MATCH_PARAMS}.${paramName}`, match.params[paramName] || '(undefined)');
  });
};

const addResponseAttributesToSpan = (span: Span, response: Response | null): void => {
  if (response) {
    span.setAttributes({
      [SemanticAttributes.HTTP_STATUS_CODE]: response.status,
    });
  }
};

const addErrorEventToSpan = (span: Span, error: Error): void => {
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
};
