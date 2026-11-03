// `remix` is an optional peer, so it is not installed here. Only the one subpath the SDK imports is
// declared, with the shape the SDK relies on. Importing it from `remix` rather than from
// `@remix-run/route-pattern` gives the SDK the copy the app's router uses, and adds no dependency for
// Remix 2 apps.
declare module 'remix/route-pattern/match' {
  export function createMultiMatcher(): {
    add(pattern: unknown, data: unknown): void;
    matchAll(url: string | URL): unknown[];
  };
}
