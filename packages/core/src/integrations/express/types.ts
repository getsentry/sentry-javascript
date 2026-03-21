import type { RequestEventData } from '../../types-hoist/request';
import type { SpanAttributes } from '../../types-hoist/span';

export const kLayerPatched: unique symbol = Symbol('express-layer-patched');
export const ATTR_EXPRESS_NAME = 'express.name';
export const ATTR_HTTP_ROUTE = 'http.route';
export const ATTR_EXPRESS_TYPE = 'express.type';

export type ExpressExport = {
  Router: ExpressRouterv5 | ExpressRouterv4;
  application: ExpressApplication;
};

export type ExpressExportv5 = ExpressExport & {
  Router: ExpressRouterv5;
};

export type ExpressExportv4 = ExpressExport & {
  Router: ExpressRouterv4;
};

export type ExpressModuleExport = ExpressExport | { default: ExpressExport };

export interface ExpressRequest extends RequestEventData {
  originalUrl: string;
  route: unknown;
  // Note: req.res is typed as optional (only present after middleware init).
  // mark optional to preserve compat with express v4 types.
  res?: ExpressResponse;
}

// just a minimum type def for what we need, since this also needs to
// work in environments lacking node:http
export interface ExpressResponse {
  once(ev: string, listener: Function): this;
  removeListener(ev: string, listener?: Function): this;
  emit(ev: string, ...data: unknown[]): this;
}

export interface NextFunction {
  (err?: unknown): void;
  /**
   * "Break-out" of a router by calling {next('router')};
   * @see {https://expressjs.com/en/guide/using-middleware.html#middleware.router}
   */
  (deferToNext: 'router'): void;
  /**
   * "Break-out" of a route by calling {next('route')};
   * @see {https://expressjs.com/en/guide/using-middleware.html#middleware.application}
   */
  (deferToNext: 'route'): void;
}

export type ExpressApplicationRequestHandler = (...handlers: unknown[]) => unknown;

export type ExpressRequestInfo<T = unknown> = {
  /** An express request object */
  request: T;
  route: string;
  layerType: ExpressLayerType;
};

export type ExpressLayerType = 'router' | 'middleware' | 'request_handler';
export const ExpressLayerType_ROUTER = 'router';
export const ExpressLayerType_MIDDLEWARE = 'middleware';
export const ExpressLayerType_REQUEST_HANDLER = 'request_handler';

export type PathParams = string | RegExp | Array<string | RegExp>;
export type LayerPathSegment = string | RegExp | number;

export interface ExpressRoute {
  path: string;
  stack: ExpressLayer[];
}

export type ExpressRouterv4 = ExpressRouter;

export interface ExpressRouterv5 {
  prototype: ExpressRouter;
}

// https://github.com/expressjs/express/blob/main/lib/router/layer.js#L33
export type ExpressLayer = {
  handle: Function &
    Record<string, unknown> & {
      stack?: ExpressLayer[];
    };
  [kLayerPatched]?: boolean;
  name: string;
  params: { [key: string]: string };
  path?: string;
  regexp: RegExp;
  route?: ExpressLayer;
};

export type ExpressRouter = {
  params: { [key: string]: string };
  _params: string[];
  caseSensitive: boolean;
  mergeParams: boolean;
  strict: boolean;
  stack: ExpressLayer[];
  route(prefix: PathParams): ExpressRoute;
  use(...handlers: unknown[]): unknown;
};

export type IgnoreMatcher = string | RegExp | ((name: string) => boolean);

export type ExpressIntegrationOptions = {
  express: ExpressModuleExport; //Express
  /** Ignore specific based on their name */
  ignoreLayers?: IgnoreMatcher[];
  /** Ignore specific layers based on their type */
  ignoreLayersType?: ExpressLayerType[];
  /**
   * Optional callback invoked each time a layer resolves the matched HTTP route.
   * Platform-specific integrations (e.g. Node.js) use this to propagate the
   * resolved route to the underlying transport layer (e.g. OTel RPCMetadata).
   */
  onRouteResolved?: (route: string | undefined) => void;
};

export type LayerMetadata = {
  attributes: SpanAttributes;
  name: string;
};

export interface ExpressApplication {
  stack: ExpressLayer[];
  use: ExpressApplicationRequestHandler;
}

export interface MiddlewareError extends Error {
  status?: number | string;
  statusCode?: number | string;
  status_code?: number | string;
  output?: {
    statusCode?: number | string;
  };
}

export type ExpressMiddleware = (req: ExpressRequest, res: ExpressResponse, next: () => void) => void;

export type ExpressErrorMiddleware = (
  error: MiddlewareError,
  req: ExpressRequest,
  res: ExpressResponse,
  next: (error: MiddlewareError) => void,
) => void;

export interface ExpressHandlerOptions {
  /**
   * Callback method deciding whether error should be captured and sent to Sentry
   * @param error Captured middleware error
   */
  shouldHandleError?(this: void, error: MiddlewareError): boolean;
}
