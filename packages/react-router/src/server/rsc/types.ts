/**
 * Type definitions for React Router RSC (React Server Components) APIs.
 *
 * These types mirror the unstable RSC APIs from react-router v7.9.0+.
 * All RSC APIs in React Router are prefixed with `unstable_` and subject to change.
 */

/**
 * RSC route configuration entry - mirrors `unstable_RSCRouteConfigEntry` from react-router.
 */
export interface RSCRouteConfigEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
  path?: string;
  index?: boolean;
  caseSensitive?: boolean;
  id?: string;
  children?: RSCRouteConfigEntry[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lazy?: () => Promise<any>;
}

/**
 * RSC payload types - mirrors the various payload types from react-router.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RSCPayload = any;

/**
 * RSC match result - mirrors `RSCMatch` from react-router.
 */
export interface RSCMatch {
  payload: RSCPayload;
  statusCode: number;
  headers: Headers;
}

/**
 * Decoded payload type for SSR rendering.
 */
export interface DecodedPayload {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formState?: Promise<any>;
  _deepestRenderedBoundaryId?: string | null;
}

/**
 * Function types for RSC operations from react-server-dom packages.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DecodeReplyFunction = (body: FormData | string, options?: any) => Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DecodeActionFunction = (body: FormData, options?: any) => Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DecodeFormStateFunction = (actionResult: any, body: FormData, options?: any) => Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LoadServerActionFunction = (id: string) => Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SSRCreateFromReadableStreamFunction = (stream: ReadableStream<Uint8Array>) => Promise<any>;
export type BrowserCreateFromReadableStreamFunction = (
  stream: ReadableStream<Uint8Array>,
  options?: { temporaryReferences?: unknown },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<any>;

/**
 * Router context provider - mirrors `RouterContextProvider` from react-router.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RouterContextProvider = any;

/**
 * Arguments for `unstable_matchRSCServerRequest`.
 */
export interface MatchRSCServerRequestArgs {
  /** Function that returns a temporary reference set for tracking references in RSC stream */
  createTemporaryReferenceSet: () => unknown;
  /** The basename to use when matching the request */
  basename?: string;
  /** Function to decode server function arguments */
  decodeReply?: DecodeReplyFunction;
  /** Per-request context provider instance */
  requestContext?: RouterContextProvider;
  /** Function to load a server action by ID */
  loadServerAction?: LoadServerActionFunction;
  /** Function to decode server actions */
  decodeAction?: DecodeActionFunction;
  /** Function to decode form state for useActionState */
  decodeFormState?: DecodeFormStateFunction;
  /** Error handler for request processing errors */
  onError?: (error: unknown) => void;
  /** The Request to match against */
  request: Request;
  /** Route definitions */
  routes: RSCRouteConfigEntry[];
  /** Function to generate Response encoding the RSC payload */
  generateResponse: (
    match: RSCMatch,
    options: { temporaryReferences: unknown; onError?: (error: unknown) => string | undefined },
  ) => Response;
}

/**
 * Function signature for `unstable_matchRSCServerRequest`.
 */
export type MatchRSCServerRequestFn = (args: MatchRSCServerRequestArgs) => Promise<Response>;

/**
 * Arguments for `unstable_routeRSCServerRequest`.
 */
export interface RouteRSCServerRequestArgs {
  /** The incoming request to route */
  request: Request;
  /** Function that forwards request to RSC handler and returns Response with RSC payload */
  fetchServer: (request: Request) => Promise<Response>;
  /** Function to decode RSC payloads from server */
  createFromReadableStream: SSRCreateFromReadableStreamFunction;
  /** Function that renders the payload to HTML */
  renderHTML: (
    getPayload: () => DecodedPayload & Promise<RSCPayload>,
  ) => ReadableStream<Uint8Array> | Promise<ReadableStream<Uint8Array>>;
  /** Whether to hydrate the server response with RSC payload (default: true) */
  hydrate?: boolean;
}

/**
 * Function signature for `unstable_routeRSCServerRequest`.
 */
export type RouteRSCServerRequestFn = (args: RouteRSCServerRequestArgs) => Promise<Response>;

/**
 * Props for `unstable_RSCHydratedRouter` component.
 */
export interface RSCHydratedRouterProps {
  /** Function to decode RSC payloads from server */
  createFromReadableStream: BrowserCreateFromReadableStreamFunction;
  /** Optional fetch implementation */
  fetch?: (request: Request) => Promise<Response>;
  /** The decoded RSC payload to hydrate */
  payload: RSCPayload;
  /** Route discovery behavior: "eager" or "lazy" */
  routeDiscovery?: 'eager' | 'lazy';
  /** Function that returns a router context provider instance */
  getContext?: () => RouterContextProvider;
}

/**
 * Context for server component wrapping.
 */
export interface ServerComponentContext {
  /** The parameterized route path (e.g., "/users/:id") */
  componentRoute: string;
  /** The type of component */
  componentType: 'Page' | 'Layout' | 'Loading' | 'Error' | 'Template' | 'Not-found' | 'Unknown';
}

/**
 * Options for server function wrapping.
 */
export interface WrapServerFunctionOptions {
  /** Custom span name. Defaults to `serverFunction/{functionName}` */
  name?: string;
  /** Additional span attributes */
  attributes?: Record<string, unknown>;
}
