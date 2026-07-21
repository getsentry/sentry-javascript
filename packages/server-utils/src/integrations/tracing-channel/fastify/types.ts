/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Integration } from '@sentry/core';

type HandlerOriginal =
  | ((request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => Promise<void>)
  | ((request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => void);

type FastifyError = any;

type HookHandlerDoneFunction = <TError extends Error = FastifyError>(err?: TError) => void;

export interface FastifyInstance {
  version: string;
  register: (plugin: any) => FastifyInstance;
  decorate: (key: string | symbol, value: unknown) => void;
  decorateRequest: (key: string | symbol, value: unknown) => void;
  setNotFoundHandler: (hooks: any, handler?: any) => void;
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

export interface FastifyIntegration extends Integration {
  getShouldHandleError: () => (error: Error, request: FastifyRequest, reply: FastifyReply) => boolean;
  // This will be removed in the next major version.
  setShouldHandleError: (
    shouldHandleError: (error: Error, request: FastifyRequest, reply: FastifyReply) => boolean,
  ) => void;
}
