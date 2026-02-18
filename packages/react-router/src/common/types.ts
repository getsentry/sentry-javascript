/**
 * Types for React Router's instrumentation API.
 *
 * Derived from React Router v7.x `unstable_instrumentations` API.
 * The stable `instrumentations` API is planned for React Router v8.
 * If React Router changes these types, this file must be updated.
 *
 * @see https://reactrouter.com/how-to/instrumentation
 * @experimental
 */

export type InstrumentationResult = { status: 'success'; error: undefined } | { status: 'error'; error: unknown };

export interface ReadonlyRequest {
  method: string;
  url: string;
  headers: Pick<Headers, 'get'>;
}

export interface RouteHandlerInstrumentationInfo {
  readonly request: ReadonlyRequest;
  readonly params: Record<string, string | undefined>;
  readonly pattern?: string;
  readonly unstable_pattern?: string;
  readonly context?: unknown;
}

export interface RouterNavigationInstrumentationInfo {
  readonly to: string | number;
  readonly currentUrl: string;
  readonly formMethod?: string;
  readonly formEncType?: string;
  readonly formData?: FormData;
  readonly body?: unknown;
}

export interface RouterFetchInstrumentationInfo {
  readonly href: string;
  readonly currentUrl: string;
  readonly fetcherKey: string;
  readonly formMethod?: string;
  readonly formEncType?: string;
  readonly formData?: FormData;
  readonly body?: unknown;
}

export interface RequestHandlerInstrumentationInfo {
  readonly request: Request;
  readonly context: unknown;
}

export type InstrumentFunction<T> = (handler: () => Promise<InstrumentationResult>, info: T) => Promise<void>;

export interface RouteInstrumentations {
  lazy?: InstrumentFunction<undefined>;
  'lazy.loader'?: InstrumentFunction<undefined>;
  'lazy.action'?: InstrumentFunction<undefined>;
  'lazy.middleware'?: InstrumentFunction<undefined>;
  middleware?: InstrumentFunction<RouteHandlerInstrumentationInfo>;
  loader?: InstrumentFunction<RouteHandlerInstrumentationInfo>;
  action?: InstrumentFunction<RouteHandlerInstrumentationInfo>;
}

export interface RouterInstrumentations {
  navigate?: InstrumentFunction<RouterNavigationInstrumentationInfo>;
  fetch?: InstrumentFunction<RouterFetchInstrumentationInfo>;
}

export interface RequestHandlerInstrumentations {
  request?: InstrumentFunction<RequestHandlerInstrumentationInfo>;
}

export interface InstrumentableRoute {
  id: string;
  index: boolean | undefined;
  path: string | undefined;
  instrument(instrumentations: RouteInstrumentations): void;
}

export interface InstrumentableRouter {
  instrument(instrumentations: RouterInstrumentations): void;
}

export interface InstrumentableRequestHandler {
  instrument(instrumentations: RequestHandlerInstrumentations): void;
}

export interface ClientInstrumentation {
  router?(router: InstrumentableRouter): void;
  route?(route: InstrumentableRoute): void;
}

export interface ServerInstrumentation {
  handler?(handler: InstrumentableRequestHandler): void;
  route?(route: InstrumentableRoute): void;
}
