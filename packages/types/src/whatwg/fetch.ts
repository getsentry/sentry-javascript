// These are vendored types for the standard web fetch API types because typescript needs the DOM types to be able to understand the `Request`, `Headers`, ... types and not everybody has those.

import type { WebReadableStream } from './stream';

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

export interface WebFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly headers: WebFetchHeaders;
  readonly url: string;
  readonly redirected: boolean;
  readonly body: WebReadableStream | null;

  clone(): WebFetchResponse;

  // Methods to consume the response body
  json(): Promise<any>; // Parses response as JSON
  text(): Promise<string>; // Reads response body as text
  arrayBuffer(): Promise<ArrayBuffer>; // Reads response body as ArrayBuffer
  blob(): Promise<object>; // Reads response body as Blob
  formData(): Promise<object>; // Reads response body as FormData
}
