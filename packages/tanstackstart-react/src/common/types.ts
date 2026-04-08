export type TanStackMiddlewareBase = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  '~types': any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: { server?: (...args: any[]) => any };
};

export type MiddlewareWrapperOptions = {
  name: string;
};
