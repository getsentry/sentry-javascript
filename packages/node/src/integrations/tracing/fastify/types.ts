/* eslint-disable @typescript-eslint/no-explicit-any */
export type HandlerOriginal =
  | ((request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => Promise<void>)
  | ((request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => void);

export type FastifyError = any;

export type HookHandlerDoneFunction = <TError extends Error = FastifyError>(err?: TError) => void;

export type FastifyErrorCodes = any;

export type FastifyPlugin = (
  instance: FastifyInstance,
  opts: any,
  done: HookHandlerDoneFunction,
) => unknown | Promise<unknown>;

export interface FastifyInstance {
  version: string;
  register: (plugin: any) => FastifyInstance;
  after: (listener?: (err: Error) => void) => FastifyInstance;
  addHook(hook: string, handler: HandlerOriginal): FastifyInstance;
  addHook(
    hook: 'onError',
    handler: (request: FastifyRequest, reply: FastifyReply, error: Error) => void,
  ): FastifyInstance;
  addHook(hook: 'onRequest', handler: (request: FastifyRequest, reply: FastifyReply) => void): FastifyInstance;
}

export interface FastifyReply {
  send: () => FastifyReply;
  statusCode: number;
}

export interface FastifyRequest {
  method?: string;
  // since fastify@4.10.0
  routeOptions?: {
    url?: string;
  };
  routerPath?: string;
}
