export type RequestInfo = {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
};

export type ErrorContext = {
  routerKind: string;
  routePath: string;
  routeType: string;
  revalidateReason?: 'on-demand' | 'stale' | undefined;
};
