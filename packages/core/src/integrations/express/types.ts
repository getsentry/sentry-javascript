import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SpanAttributes } from '../../types-hoist/span';

export const ATTR_EXPRESS_NAME = 'express.name';
export const ATTR_HTTP_ROUTE = 'http.route';
export const ATTR_EXPRESS_TYPE = 'express.type';

export type ExpressExport = {
  Router: Routerv5 | Routerv4;
  application: ExpressApplication;
};

export type ExpressModuleExport = ExpressExport | { default: ExpressExport };

export interface ExpressRequest extends IncomingMessage {
  originalUrl: string;
  route: unknown;
  application: ExpressApplication;
  res: ExpressResponse;
}

export interface ExpressResponse extends ServerResponse {}

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

export interface Router {
  route(prefix: PathParams): ExpressRoute;
  use(...handlers: unknown[]): unknown;
  stack: ExpressLayer[];
}

export type Routerv4 = Router;

export interface Routerv5 {
  prototype: Router;
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
};

export const kLayerPatched: unique symbol = Symbol('express-layer-patched');

export type IgnoreMatcher = string | RegExp | ((name: string) => boolean);

export type ExpressIntegrationOptions = {
  express: ExpressExport; //Express
  /** Ignore specific based on their name */
  ignoreLayers?: IgnoreMatcher[];
  /** Ignore specific layers based on their type */
  ignoreLayersType?: ExpressLayerType[];
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

export type ExpressMiddleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

export type ExpressErrorMiddleware = (
  error: MiddlewareError,
  req: IncomingMessage,
  res: ServerResponse,
  next: (error: MiddlewareError) => void,
) => void;

export interface ExpressHandlerOptions {
  /**
   * Callback method deciding whether error should be captured and sent to Sentry
   * @param error Captured middleware error
   */
  shouldHandleError?(this: void, error: MiddlewareError): boolean;
}
