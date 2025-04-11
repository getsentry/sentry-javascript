// These are vendored types for the standard web fetch API types because typescript needs the DOM types to be able to understand the `Request`, `Headers`, ... types and not everybody has those.

export interface WebFetchHeaders {
  append(name: string, value: string): void;
  delete(name: string): void;
  get(name: string): string | null;
  has(name: string): boolean;
  set(name: string, value: string): void;
  forEach(callbackfn: (value: string, key: string, parent: WebFetchHeaders) => void): void;
}

export interface WebFetchRequest {
  readonly headers: WebFetchHeaders;
  readonly method: string;
  readonly url: string;
  clone(): WebFetchRequest;
}
