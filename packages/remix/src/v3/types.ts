// Structural copies of the `@remix-run/fetch-router` types the SDK touches, so it builds whether or
// not Remix 3 is installed.

export interface RoutePatternLike {
  source: string;
}

/** What the router stores in its matcher, reachable as `match.data`. */
export interface RouteEntryLike {
  pattern: RoutePatternLike;
  method: string;
}

export interface MatchLike {
  data: RouteEntryLike;
  params: Record<string, string | undefined>;
}

/** Only these two, because they are all the router calls on whatever matcher it is given. */
export interface MatcherLike {
  add(pattern: unknown, data: unknown): void;
  matchAll(url: string | URL): MatchLike[];
}

export interface RequestContextLike {
  request: Request;
  url: URL;
  method: string;
  params: Record<string, string | undefined>;
}

export type NextFunctionLike = () => Promise<Response>;

export type MiddlewareLike = (context: RequestContextLike, next: NextFunctionLike) => Promise<Response> | Response;

export interface RouterOptionsLike {
  middleware?: MiddlewareLike[];
  matcher?: MatcherLike;
}

/** `createRequestListener`'s options, of which only the error hook is touched. */
export interface RequestListenerOptionsLike {
  onError?: (error: unknown) => void | Response | Promise<void | Response>;
}
