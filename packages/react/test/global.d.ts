// Have to manually set types because we are using package-alias
// Note that using e.g. ` "@types/react-router-3": "npm:@types/react-router@3.0.24",` in package.json does not work,
// because the react-router v3 types re-export types from react-router/lib which ends up being the react router v6 types
// So instead, we provide the types manually here
declare module 'react-router-3' {
  import type * as React from 'react';
  import type { Match, Route as RouteType } from '../src/reactrouterv3';

  type History = { replace: (s: string) => void; push: (s: string) => void };
  export function createMemoryHistory(): History;
  export const Router: React.ComponentType<{ history: History }>;
  export const Route: React.ComponentType<{ path: string; component?: React.ComponentType<any> }>;
  export const IndexRoute: React.ComponentType<{ component: React.ComponentType<any> }>;
  export const match: Match;
  export const createRoutes: (routes: any) => RouteType[];
}
