// We need to disable eslint no-explict-any because any is required for the

import type { Action, Location } from '../types';

// react-router typings.
export type Match = { path: string; url: string; params: Record<string, any>; isExact: boolean }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type RouterHistory = {
  location?: Location;
  listen?(cb: (location: Location, action: Action) => void): void;
} & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type RouteConfig = {
  [propName: string]: unknown;
  path?: string | string[];
  exact?: boolean;
  component?: JSX.Element;
  routes?: RouteConfig[];
};

export type MatchPath = (pathname: string, props: string | string[] | any, parent?: Match | null) => Match | null; // eslint-disable-line @typescript-eslint/no-explicit-any
