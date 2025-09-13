// Vendored from: https://github.com/honojs/hono/blob/855e5b1adbf685bf4b3e6b76573aa7cb0a108d04/src/request.ts#L30
export type HonoRequest = {
  path: string;
  method: string;
};

// Vendored from: https://github.com/honojs/hono/blob/855e5b1adbf685bf4b3e6b76573aa7cb0a108d04/src/context.ts#L291
export type Context = {
  req: HonoRequest;
  res: Response;
  error: Error | undefined;
};

// Vendored from: https://github.com/honojs/hono/blob/855e5b1adbf685bf4b3e6b76573aa7cb0a108d04/src/types.ts#L36C1-L36C39
export type Next = () => Promise<void>;

// Vendored from: https://github.com/honojs/hono/blob/855e5b1adbf685bf4b3e6b76573aa7cb0a108d04/src/types.ts#L73
export type Handler = (c: Context, next: Next) => Promise<Response> | Response;

// Vendored from: https://github.com/honojs/hono/blob/855e5b1adbf685bf4b3e6b76573aa7cb0a108d04/src/types.ts#L80
export type MiddlewareHandler = (c: Context, next: Next) => Promise<Response | void>;

// Vendored from: https://github.com/honojs/hono/blob/855e5b1adbf685bf4b3e6b76573aa7cb0a108d04/src/types.ts#L109
export type HandlerInterface = {
  (...handlers: (Handler | MiddlewareHandler)[]): HonoInstance;
  (path: string, ...handlers: (Handler | MiddlewareHandler)[]): HonoInstance;
};

// Vendored from: https://github.com/honojs/hono/blob/855e5b1adbf685bf4b3e6b76573aa7cb0a108d04/src/types.ts#L1071
export type OnHandlerInterface = {
  (method: string | string[], path: string | string[], ...handlers: (Handler | MiddlewareHandler)[]): HonoInstance;
};

// Vendored from: https://github.com/honojs/hono/blob/855e5b1adbf685bf4b3e6b76573aa7cb0a108d04/src/types.ts#L679
export type MiddlewareHandlerInterface = {
  (...handlers: MiddlewareHandler[]): HonoInstance;
  (path: string, ...handlers: MiddlewareHandler[]): HonoInstance;
};

// Vendored from: https://github.com/honojs/hono/blob/855e5b1adbf685bf4b3e6b76573aa7cb0a108d04/src/hono-base.ts#L99
export interface HonoInstance {
  get: HandlerInterface;
  post: HandlerInterface;
  put: HandlerInterface;
  delete: HandlerInterface;
  options: HandlerInterface;
  patch: HandlerInterface;
  all: HandlerInterface;
  on: OnHandlerInterface;
  use: MiddlewareHandlerInterface;
}

export type Hono = new (...args: unknown[]) => HonoInstance;
