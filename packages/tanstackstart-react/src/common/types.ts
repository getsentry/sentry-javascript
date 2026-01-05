export type TanStackMiddleware = {
  options?: { server?: (...args: unknown[]) => unknown };
  __SENTRY_WRAPPED__?: boolean;
};

export type MiddlewareWrapperOptions = {
  name: string;
};
