import { Transaction, TransactionContext } from '@sentry/types';

export type Action = 'PUSH' | 'REPLACE' | 'POP';

export type Location = {
  pathname: string;
  action?: Action;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} & Record<string, any>;

export type ReactRouterInstrumentation = <T extends Transaction>(
  startTransaction: (context: TransactionContext) => T | undefined,
  startTransactionOnPageLoad?: boolean,
  startTransactionOnLocationChange?: boolean,
) => void;

// React Router v6 Vendored Types
export interface NonIndexRouteObject {
  caseSensitive?: boolean;
  children?: RouteObject[];
  element?: React.ReactNode | null;
  index?: false;
  path?: string;
}

export interface IndexRouteObject {
  caseSensitive?: boolean;
  children?: undefined;
  element?: React.ReactNode | null;
  index: true;
  path?: string;
}

// This type was originally just `type RouteObject = IndexRouteObject`, but this was changed
// in https://github.com/remix-run/react-router/pull/9366, which was released with `6.4.2`
// See https://github.com/remix-run/react-router/issues/9427 for a discussion on this.
export type RouteObject = IndexRouteObject | NonIndexRouteObject;

export type Params<Key extends string = string> = {
  readonly [key in Key]: string | undefined;
};

export type UseRoutes = (routes: RouteObject[], locationArg?: Partial<Location> | string) => React.ReactElement | null;

// https://github.com/remix-run/react-router/blob/9fa54d643134cd75a0335581a75db8100ed42828/packages/react-router/lib/router.ts#L114-L134
export interface RouteMatch<ParamKey extends string = string> {
  /**
   * The names and values of dynamic parameters in the URL.
   */
  params: Params<ParamKey>;
  /**
   * The portion of the URL pathname that was matched.
   */
  pathname: string;
  /**
   * The portion of the URL pathname that was matched before child routes.
   */
  pathnameBase: string;
  /**
   * The route object that was used to match.
   */
  route: RouteObject;
}

export type UseEffect = (cb: () => void, deps: unknown[]) => void;
export type UseLocation = () => Location;
export type UseNavigationType = () => Action;

// For both of these types, use `any` instead of `RouteObject[]` or `RouteMatch[]`.
// Have to do this so we maintain backwards compatability between
// react-router > 6.0.0 and >= 6.4.2.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RouteObjectArrayAlias = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RouteMatchAlias = any;
export type CreateRoutesFromChildren = (children: JSX.Element[]) => RouteObjectArrayAlias;
export type MatchRoutes = (routes: RouteObjectArrayAlias, location: Location) => RouteMatchAlias[] | null;

// Types for react-router >= 6.4.2
export type ShouldRevalidateFunction = (args: any) => boolean;

interface DataFunctionArgs {
  request: Request;
  params: Params;
}

type LoaderFunctionArgs = DataFunctionArgs;
type ActionFunctionArgs = DataFunctionArgs;

export interface LoaderFunction {
  (args: LoaderFunctionArgs): Promise<Response> | Response | Promise<any> | any;
}
export interface ActionFunction {
  (args: ActionFunctionArgs): Promise<Response> | Response | Promise<any> | any;
}
declare type AgnosticBaseRouteObject = {
  caseSensitive?: boolean;
  path?: string;
  id?: string;
  loader?: LoaderFunction;
  action?: ActionFunction;
  hasErrorBoundary?: boolean;
  shouldRevalidate?: ShouldRevalidateFunction;
  handle?: any;
};

export declare type AgnosticIndexRouteObject = AgnosticBaseRouteObject & {
  children?: undefined;
  index: true;
};

export declare type AgnosticNonIndexRouteObject = AgnosticBaseRouteObject & {
  children?: AgnosticRouteObject[];
  index?: false;
};

export declare type AgnosticDataIndexRouteObject = AgnosticIndexRouteObject & {
  id: string;
};

export declare type AgnosticDataNonIndexRouteObject = AgnosticNonIndexRouteObject & {
  children?: AgnosticDataRouteObject[];
  id: string;
};

export interface AgnosticRouteMatch<
  ParamKey extends string = string,
  RouteObjectType extends AgnosticRouteObject = AgnosticRouteObject,
> {
  params: Params<ParamKey>;
  pathname: string;
  pathnameBase: string;
  route: RouteObjectType;
}

export type AgnosticDataRouteMatch = AgnosticRouteMatch<string, AgnosticDataRouteObject>;

interface UseMatchesMatch {
  id: string;
  pathname: string;
  params: AgnosticRouteMatch['params'];
  data: unknown;
  handle: unknown;
}

export interface GetScrollRestorationKeyFunction {
  (location: Location, matches: UseMatchesMatch[]): string | null;
}

export interface Path {
  pathname: string;
  search: string;
  hash: string;
}

export interface RouterSubscriber {
  (state: RouterState): void;
}
export interface GetScrollPositionFunction {
  (): number;
}

declare type LinkNavigateOptions = {
  replace?: boolean;
  state?: any;
  preventScrollReset?: boolean;
};

export declare type AgnosticDataRouteObject = AgnosticDataIndexRouteObject | AgnosticDataNonIndexRouteObject;
export declare type To = string | Partial<Path>;
export declare type HydrationState = any;
export declare type FormMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
export declare type FormEncType = 'application/x-www-form-urlencoded' | 'multipart/form-data';
export declare type RouterNavigateOptions = LinkNavigateOptions | SubmissionNavigateOptions;
export declare type AgnosticRouteObject = AgnosticIndexRouteObject | AgnosticNonIndexRouteObject;

declare type SubmissionNavigateOptions = {
  replace?: boolean;
  state?: any;
  formMethod?: FormMethod;
  formEncType?: FormEncType;
  formData: FormData;
};

export interface RouterInit {
  basename?: string;
  routes: AgnosticRouteObject[];
  history: History;
  hydrationData?: HydrationState;
}

export type NavigationStates = {
  Idle: {
    state: 'idle';
    location: undefined;
    formMethod: undefined;
    formAction: undefined;
    formEncType: undefined;
    formData: undefined;
  };
  Loading: {
    state: 'loading';
    location: Location;
    formMethod: FormMethod | undefined;
    formAction: string | undefined;
    formEncType: FormEncType | undefined;
    formData: FormData | undefined;
  };
  Submitting: {
    state: 'submitting';
    location: Location;
    formMethod: FormMethod;
    formAction: string;
    formEncType: FormEncType;
    formData: FormData;
  };
};

export type Navigation = NavigationStates[keyof NavigationStates];

export interface RouterState {
  historyAction: Action;
  location: Location;
  matches: AgnosticDataRouteMatch[];
  initialized: boolean;
  navigation: Navigation;
}
export interface Router {
  basename: string;
  state: RouterState;
  routes: AgnosticDataRouteObject[];
  _internalFetchControllers: any;
  _internalActiveDeferreds: any;
  initialize(): Router;
  subscribe(fn: RouterSubscriber): () => void;
  enableScrollRestoration(
    savedScrollPositions: Record<string, number>,
    getScrollPosition: GetScrollPositionFunction,
    getKey?: any,
  ): () => void;
  navigate(to: number): void;
  navigate(to: To, opts?: RouterNavigateOptions): void;
  fetch(key: string, routeId: string, href: string, opts?: RouterNavigateOptions): void;
  revalidate(): void;
  createHref(location: Location | URL): string;
  getFetcher(key?: string): any;
  deleteFetcher(key?: string): void;
  dispose(): void;
}

export type CreateRouterFunction = (
  routes: RouteObject[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opts?: any,
) => Router;
