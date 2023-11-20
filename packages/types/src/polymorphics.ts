/**
 * Event-like interface that's usable in browser and node.
 *
 * Note: Here we mean the kind of events handled by event listeners, not our `Event` type.
 *
 * Property availability taken from https://developer.mozilla.org/en-US/docs/Web/API/Event#browser_compatibility
 */
export interface PolymorphicEvent {
  [key: string]: unknown;
  readonly type: string;
  readonly target?: unknown;
  readonly currentTarget?: unknown;
}

// TODO(v8): Instead of having this mess of a type we should simply stricly define *some* request interface for the
// `sdkProcessingMetadata` and than have a variety of utility functions that map to this type to be used by the
// RequestData integration.e.g. `normalizeExpressRequest`, or`normalizeKoaRequest`.
// These utility functions are then used by the respective integrations to transform the Framework specific request
// objects to a format that is compatible with the`RequestData` integration.
/** A `Request` type compatible with Node, Express, browser, etc., because everything is optional */
export type PolymorphicRequest = BaseRequest &
  BrowserRequest &
  NodeRequest &
  ExpressRequest &
  KoaRequest &
  NextjsRequest;

type BaseRequest = {
  method?: string;
  url?: string;
};

type BrowserRequest = BaseRequest;

type NodeRequest = BaseRequest & {
  headers?: {
    [key: string]: string | string[] | undefined;
  };
  protocol?: string;
  socket?: {
    encrypted?: boolean;
    remoteAddress?: string;
  };
};

type KoaRequest = NodeRequest & {
  host?: string;
  hostname?: string;
  ip?: string;
  originalUrl?: string;
};

type NextjsRequest = NodeRequest & {
  cookies?: {
    [key: string]: string;
  };
  query?: {
    [key: string]: any;
  };
};

type ExpressRequest = NodeRequest & {
  baseUrl?: string;
  body?: string | { [key: string]: any };
  host?: string;
  hostname?: string;
  ip?: string;
  originalUrl?: string;
  route?: {
    path: string;
    stack: [
      {
        name: string;
      },
    ];
  };
  query?: {
    [key: string]: any;
  };
  user?: {
    [key: string]: any;
  };
  _reconstructedRoute?: string;
};
