export type TanStackMiddlewareBase = {
  options?: { server?: (...args: unknown[]) => unknown };
};

export type MiddlewareWrapperOptions = {
  name: string;
};
