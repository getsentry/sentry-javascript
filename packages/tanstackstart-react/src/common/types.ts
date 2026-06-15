export type TanStackMiddlewareBase = {
  '~types': unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: { server?: (...args: any[]) => any };
};

/**
 * Structurally mirrors TanStack Start's `RequestMiddlewareTypes` for a middleware that contributes
 * nothing to the middleware chain. The context-related fields are deliberately typed as `undefined`
 * rather than `any`: TanStack Start merges middleware context types through these fields, so an
 * `any` here would turn the inferred `context` of every subsequent middleware and handler into `any`.
 */
type SentryRequestMiddlewareTypes = {
  type: 'request';
  middlewares: undefined;
  allInput: undefined;
  allOutput: undefined;
  serverContext: undefined;
  allServerContext: undefined;
};

/**
 * Structurally mirrors TanStack Start's `FunctionMiddlewareTypes` for a middleware that contributes
 * nothing to the middleware chain (see `SentryRequestMiddlewareTypes`).
 */
type SentryFunctionMiddlewareTypes = {
  type: 'function';
  middlewares: undefined;
  input: undefined;
  allInput: undefined;
  output: undefined;
  allOutput: undefined;
  clientContext: undefined;
  allClientContextBeforeNext: undefined;
  allClientContextAfterNext: undefined;
  serverContext: undefined;
  serverSendContext: undefined;
  allServerSendContext: undefined;
  allServerContext: undefined;
  clientSendContext: undefined;
  allClientSendContext: undefined;
  validator: undefined;
  inputValidator: undefined;
};

/**
 * Type of the `sentryGlobalRequestMiddleware` export.
 *
 * Declares the middleware type information under both `~types` (TanStack Start >=1.143) and
 * `_types` (older versions) so the middleware satisfies `AnyRequestMiddleware` across the
 * supported version range.
 */
export type SentryGlobalRequestMiddleware = {
  '~types': SentryRequestMiddlewareTypes;
  _types: SentryRequestMiddlewareTypes;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: { server?: (...args: any[]) => any };
};

/**
 * Type of the `sentryGlobalFunctionMiddleware` export.
 *
 * Declares the middleware type information under both `~types` (TanStack Start >=1.143) and
 * `_types` (older versions) so the middleware satisfies `AnyFunctionMiddleware` across the
 * supported version range.
 */
export type SentryGlobalFunctionMiddleware = {
  '~types': SentryFunctionMiddlewareTypes;
  _types: SentryFunctionMiddlewareTypes;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: { server?: (...args: any[]) => any };
};

export type MiddlewareWrapperOptions = {
  name: string;
};
